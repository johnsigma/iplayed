import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// `created_at`/`updated_at` guardam instantes reais ("esta linha foi criada
// neste momento"). TIMESTAMP não registra a que fuso os números pertencem, o
// que deixa o instante ambíguo; TIMESTAMPTZ normaliza para UTC ao gravar e
// converte na leitura, então o instante é o mesmo para qualquer leitor.
//
// `AT TIME ZONE 'UTC'` diz ao Postgres em que fuso interpretar os valores já
// gravados. Isso é correto aqui porque os dois bancos rodam com TimeZone =
// UTC (verificado em 01/10/2026), então `now()` sempre gravou horário UTC.
// Num banco com outro fuso, essa interpretação estaria errada e deslocaria
// todos os registros existentes.
//
// `pgmigrations.run_on` é da própria ferramenta de migration e não é tocada.
const TABLES = ['users', 'games', 'reviews'] as const;

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const table of TABLES) {
    pgm.sql(`
      ALTER TABLE "${table}"
        ALTER COLUMN "created_at" TYPE TIMESTAMPTZ USING "created_at" AT TIME ZONE 'UTC',
        ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ USING "updated_at" AT TIME ZONE 'UTC';
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const table of TABLES) {
    pgm.sql(`
      ALTER TABLE "${table}"
        ALTER COLUMN "created_at" TYPE TIMESTAMP USING "created_at" AT TIME ZONE 'UTC',
        ALTER COLUMN "updated_at" TYPE TIMESTAMP USING "updated_at" AT TIME ZONE 'UTC';
    `);
  }
}
