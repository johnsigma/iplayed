import { pool } from '@shared/infra/database';

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
