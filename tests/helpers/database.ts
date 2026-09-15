import { pool } from '@shared/infra/database';

/**
 * Fecha o pool do arquivo de teste atual.
 *
 * Precisa ser chamado no `afterAll` de cada arquivo de teste de integração:
 * o Jest dá a cada arquivo seu próprio registro de módulos, então cada um
 * cria o seu pool. O `globalTeardown` roda em um registro separado e não tem
 * como alcançar esses pools — sem isso, as conexões ociosas seguram o event
 * loop e o processo do Jest não encerra.
 */
export async function closeDatabase(): Promise<void> {
  await pool.end();
}

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
