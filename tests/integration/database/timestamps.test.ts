import { pool } from '@shared/infra/database';
import { clearDatabase, closeDatabase } from '@tests/helpers/database';

const AUDIT_COLUMNS = [
  ['users', 'created_at'],
  ['users', 'updated_at'],
  ['games', 'created_at'],
  ['games', 'updated_at'],
  ['reviews', 'created_at'],
  ['reviews', 'updated_at'],
];

describe('Timestamps de auditoria (integração, issue #51)', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(closeDatabase);

  // O QUE VERIFICA: as seis colunas `created_at`/`updated_at` (users, games,
  // reviews) são TIMESTAMPTZ.
  //
  // POR QUE FOI CRIADO: são instantes reais ("esta linha foi criada neste
  // momento"). Com TIMESTAMP, o banco guarda só os dígitos da hora, sem dizer
  // a que fuso pertencem — o instante fica ambíguo. É a garantia estrutural
  // da migration da #51.
  //
  // O QUE GARANTE: que nenhuma das seis colunas voltou (ou deixou de ser
  // convertida) para o tipo sem fuso. Uma tabela nova com colunas de
  // auditoria copiadas do jeito antigo não é pega aqui — só as seis
  // conhecidas.
  it('should store audit columns as timestamptz', async () => {
    const result = await pool.query(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (table_name, column_name) IN (${AUDIT_COLUMNS.map(
            (_c, i) => `($${i * 2 + 1}, $${i * 2 + 2})`,
          ).join(', ')})`,
      AUDIT_COLUMNS.flat(),
    );

    expect(result.rows).toHaveLength(AUDIT_COLUMNS.length);
    for (const row of result.rows) {
      expect(row.data_type).toBe('timestamp with time zone');
    }
  });

  // O QUE VERIFICA: um instante gravado numa sessão com um fuso é o mesmo
  // instante lido por uma sessão com outro fuso. A sessão A (São Paulo)
  // grava 12:00 UTC; a sessão B (Tóquio) compara o valor lido com 12:00 UTC.
  //
  // POR QUE FOI CRIADO: é o problema que a issue descreve — leitores em
  // fusos diferentes verem horas diferentes sem saber qual é a certa. O
  // teste foi desenhado para falhar com TIMESTAMP em qualquer máquina: com o
  // tipo sem fuso, o `+00` do literal é descartado na gravação, e a
  // comparação feita pela sessão de Tóquio interpreta os dígitos como
  // horário de Tóquio (12:00 Tóquio ≠ 12:00 UTC). Um teste que lesse o valor
  // como `Date` no Node dependeria do fuso de quem roda, e poderia passar por
  // acidente num CI em UTC.
  //
  // O QUE GARANTE: que o instante sobrevive à troca de fuso de sessão — que
  // é o que "guardar um instante" significa.
  it('should keep the same instant across sessions in different time zones', async () => {
    const writer = await pool.connect();
    const reader = await pool.connect();

    try {
      await writer.query("SET TIME ZONE 'America/Sao_Paulo'");
      await writer.query(
        `INSERT INTO users (username, email, password_hash, created_at)
         VALUES ('tz_user', 'tz@test.com', 'hash', '2026-01-15 12:00:00+00')`,
      );

      await reader.query("SET TIME ZONE 'Asia/Tokyo'");
      const result = await reader.query(
        `SELECT created_at = '2026-01-15 12:00:00+00'::timestamptz AS same_instant
           FROM users WHERE username = 'tz_user'`,
      );

      expect(result.rows[0].same_instant).toBe(true);
    } finally {
      writer.release();
      reader.release();
    }
  });

  // O QUE VERIFICA: o trigger de `updated_at` continua preenchendo a coluna
  // depois da conversão, e o valor preenchido é um instante atual (a diferença
  // para o relógio do banco é de poucos segundos).
  //
  // POR QUE FOI CRIADO: o trigger usa `now()`, que devolve timestamptz.
  // Antes da migration ele era convertido implicitamente para a coluna sem
  // fuso; agora o tipo bate. O teste existente (triggers.test.ts) já
  // garante que o trigger dispara; este garante que o valor continua certo
  // — um deslocamento de horas aqui apareceria como diferença enorme.
  //
  // O QUE GARANTE: que a conversão do tipo não quebrou o contrato do
  // trigger nem deslocou o horário que ele grava.
  it('should keep the updated_at trigger writing the current instant', async () => {
    await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ('trigger_tz', 'trigger_tz@test.com', 'hash')`,
    );

    const result = await pool.query(
      `UPDATE users SET username = 'trigger_tz_v2' WHERE username = 'trigger_tz'
       RETURNING abs(extract(epoch FROM (now() - updated_at))) AS seconds_off`,
    );

    expect(Number(result.rows[0].seconds_off)).toBeLessThan(5);
  });
});
