import { PoolClient } from 'pg';

// O `pg` é mockado aqui porque o que está sendo testado é o protocolo do
// helper (BEGIN/COMMIT/ROLLBACK e devolução do client), não o resultado de
// queries reais — isso está coberto pelos testes de integração do upsert.
type FakeClient = {
  query: jest.Mock;
  release: jest.Mock;
};

function setupPool(client: FakeClient) {
  jest.doMock('@shared/infra/database', () => ({
    pool: { connect: jest.fn().mockResolvedValue(client) },
  }));
}

function createClient(queryImpl?: (sql: string) => Promise<unknown>) {
  return {
    query: jest.fn(queryImpl ?? (() => Promise.resolve({ rows: [] }))),
    release: jest.fn(),
  };
}

async function loadWithTransaction() {
  const module = await import('@shared/infra/database/withTransaction');
  return module.withTransaction;
}

describe('withTransaction', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should commit and release the client when the callback succeeds', async () => {
    const client = createClient();
    setupPool(client);

    const withTransaction = await loadWithTransaction();
    const result = await withTransaction(async () => 'pronto');

    expect(result).toBe('pronto');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('should roll back and rethrow the original error when the callback fails', async () => {
    const client = createClient();
    setupPool(client);

    const withTransaction = await loadWithTransaction();

    await expect(
      withTransaction(async () => {
        throw new Error('falha no meio da transação');
      }),
    ).rejects.toThrow('falha no meio da transação');

    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN',
      'ROLLBACK',
    ]);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  // O caso sutil: se a conexão morre no meio, o próprio ROLLBACK falha. O
  // erro original precisa sobreviver, e o client não pode voltar ao pool com
  // uma transação aberta — senão a próxima operação herda um
  // "current transaction is aborted".
  it('should keep the original error and destroy the client when ROLLBACK fails', async () => {
    const client = createClient((sql: string) => {
      if (sql === 'ROLLBACK') {
        return Promise.reject(new Error('conexão perdida'));
      }
      return Promise.resolve({ rows: [] });
    });
    setupPool(client);

    const withTransaction = await loadWithTransaction();

    await expect(
      withTransaction(async () => {
        throw new Error('erro original');
      }),
    ).rejects.toThrow('erro original');

    expect(client.release).toHaveBeenCalledWith(true);
  });

  it('should hand the transaction client to the callback', async () => {
    const client = createClient();
    setupPool(client);

    const withTransaction = await loadWithTransaction();
    let received: PoolClient | undefined;

    await withTransaction(async (transactionClient) => {
      received = transactionClient;
    });

    expect(received).toBe(client);
  });
});
