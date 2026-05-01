import { pool } from '../../src/shared/infra/database';

export default async function globalTeardown() {
  console.log('Limpando o ambiente de teste...');
  await pool.end();
}
