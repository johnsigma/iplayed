import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    
    CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    
    CREATE TRIGGER set_updated_at_games
    BEFORE UPDATE ON "games"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    
    CREATE TRIGGER set_updated_at_reviews
    BEFORE UPDATE ON "reviews"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TRIGGER IF EXISTS set_updated_at_users ON "users";
    DROP TRIGGER IF EXISTS set_updated_at_games ON "games";
    DROP TRIGGER IF EXISTS set_updated_at_reviews ON "reviews";
    DROP FUNCTION IF EXISTS set_updated_at();
  `);
}
