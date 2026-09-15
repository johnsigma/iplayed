// Testa o comportamento do módulo de conexão (src/shared/infra/database/index.ts)
// em isolamento, mockando o `pg` — não é um teste de integração porque o que
// está em jogo aqui é a lógica de gerenciamento do pool (liberar client,
// não derrubar o processo em erro), não o resultado de uma query real.
describe('database connection module', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should release the client back to the pool after the startup connectivity check', async () => {
    const release = jest.fn();
    const connect = jest.fn((callback: (...args: unknown[]) => void) =>
      callback(null, {}, release),
    );

    jest.doMock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => ({
        connect,
        on: jest.fn(),
        end: jest.fn(),
      })),
    }));

    await import('@shared/infra/database');

    // Sem o `release()`, essa conexão de teste ficaria presa no pool para
    // sempre — é exatamente o vazamento que esse teste evita que volte.
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('should not crash the process when the pool emits an unexpected error on an idle client', async () => {
    let errorHandler: ((err: Error) => void) | undefined;
    const on = jest.fn((event: string, handler: (err: Error) => void) => {
      if (event === 'error') errorHandler = handler;
    });

    jest.doMock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => ({
        connect: jest.fn(),
        on,
        end: jest.fn(),
      })),
    }));

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => {
        throw new Error('process.exit não deveria ser chamado');
      }) as never);

    await import('@shared/infra/database');

    expect(errorHandler).toBeDefined();
    expect(() => errorHandler?.(new Error('conexão derrubada'))).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
