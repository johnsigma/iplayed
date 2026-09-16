import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // As duas colunas guardam um fato de calendário ("saiu em 19/05/2015"), não
  // um instante — TIMESTAMP carregava uma hora que nunca teve significado e
  // ficava ambíguo quanto a fuso na leitura. `USING coluna::date` descarta a
  // parte de hora que já estava lá (sempre meia-noite, por convenção da
  // migration anterior e do service).
  //
  // O cast é destrutivo para qualquer timestamp que não seja meia-noite — sem
  // problema hoje porque as duas tabelas estão vazias neste momento (nenhum
  // jogo foi persistido em produção ainda), mas seria uma perda de dado
  // silenciosa se rodado depois de a tabela ter linhas com hora não-zero.
  pgm.sql(`
    ALTER TABLE "games"
      ALTER COLUMN "first_release_date" TYPE DATE USING "first_release_date"::date;
  `);

  pgm.sql(`
    ALTER TABLE "game_platforms"
      ALTER COLUMN "release_date" TYPE DATE USING "release_date"::date;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE "games"
      ALTER COLUMN "first_release_date" TYPE TIMESTAMP USING "first_release_date"::timestamp;
  `);

  pgm.sql(`
    ALTER TABLE "game_platforms"
      ALTER COLUMN "release_date" TYPE TIMESTAMP USING "release_date"::timestamp;
  `);
}
