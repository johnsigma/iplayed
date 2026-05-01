import { pool } from '@shared/infra/database';
import { clearDatabase } from '../../helpers/database';

describe('Database Triggers', () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  it('should set updated_at when a user row is updated', async () => {
    const insertResult = await pool.query(`
      INSERT INTO users (username, email, password_hash)
      VALUES ('trigger_user', 'trigger@test.com', 'hash123')
      RETURNING id, updated_at;
    `);

    const userId: string = insertResult.rows[0].id;
    expect(insertResult.rows[0].updated_at).toBeNull();

    const firstUpdate = await pool.query(
      `
      UPDATE users SET username = 'trigger_user_v2' WHERE id = $1 RETURNING updated_at`,
      [userId],
    );

    const firstUpdatedAt: Date = firstUpdate.rows[0].updated_at;
    expect(firstUpdatedAt).not.toBeNull();

    await pool.query(`SELECT pg_sleep(0.01)`);

    const secondUpdate = await pool.query(
      `
      UPDATE users SET username = 'trigger_user_v3' WHERE id = $1 RETURNING updated_at`,
      [userId],
    );

    const secondUpdatedAt: Date = secondUpdate.rows[0].updated_at;
    expect(secondUpdatedAt.getTime()).toBeGreaterThan(firstUpdatedAt.getTime());
  });
});
