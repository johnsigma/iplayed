import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE "review_scores" ALTER COLUMN "score" TYPE decimal(3,1);
    `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE "review_scores" ALTER COLUMN "score" TYPE integer USING round(score)::integer;`);
}
