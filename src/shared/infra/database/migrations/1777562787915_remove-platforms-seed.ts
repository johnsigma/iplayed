import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DELETE FROM platforms;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO platforms (id_igdb, name, slug) VALUES
      (6, 'PC (Windows)', 'win'),
      (48, 'PlayStation 4', 'ps4'),
      (167, 'PlayStation 5', 'ps5'),
      (49, 'Xbox One', 'xbox1'),
      (169, 'Xbox Series X|S', 'series-x'),
      (130, 'Nintendo Switch', 'switch');
  `);
}
