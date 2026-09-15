import { pool } from '@shared/infra/database';

// This function is used to clear the database between tests. It truncates all tables and resets their identities.
export async function clearDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      review_scores,
      reviews,
      game_platforms,
      games,
      platforms,
      users
    RESTART IDENTITY CASCADE;
    `);
}
