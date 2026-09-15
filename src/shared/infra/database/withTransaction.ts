import { PoolClient } from 'pg';
import { pool } from './index';

/**
 * Executa um callback dentro de uma transação, garantindo três coisas que são
 * fáceis de esquecer quando escritas à mão em cada operação:
 *
 * 1. `COMMIT` só acontece se o callback terminar sem lançar
 * 2. qualquer erro dispara `ROLLBACK` antes de ser propagado
 * 3. o client volta para o pool no `finally`, mesmo em caso de erro — a
 *    ausência disso é exatamente o vazamento de conexão que já aconteceu
 *    neste projeto uma vez
 *
 * O callback recebe o `client` da transação e precisa usá-lo em todas as
 * queries: usar o `pool` diretamente lá dentro pegaria outra conexão, que
 * ficaria de fora da transação.
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let clientIsBroken = false;

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Se nem o ROLLBACK passou, a conexão provavelmente morreu. Devolver
      // esse client ao pool deixaria uma transação aberta para a próxima
      // operação herdar ("current transaction is aborted"), então ele é
      // destruído em vez de reaproveitado.
      clientIsBroken = true;
    }

    // Sempre o erro original: a falha do ROLLBACK é consequência, não causa.
    throw error;
  } finally {
    client.release(clientIsBroken);
  }
}
