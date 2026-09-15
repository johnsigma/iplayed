// Testa o comportamento do módulo de conexão (src/shared/infra/database/index.ts)
// em isolamento, mockando o `pg` — o que está em jogo aqui é o gerenciamento
// do pool (não conectar no import, liberar o client, não derrubar o processo
// em erro), não o resultado de queries reais.
describe('database connection module', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  function mockPg(overrides: {
    connect?: jest.Mock;
    on?: jest.Mock;
  }): { connect: jest.Mock; on: jest.Mock } {
    const connect = overrides.connect ?? jest.fn();
    const on = overrides.on ?? jest.fn();

    jest.doMock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => ({
        connect,
        on,
        end: jest.fn(),
      })),
    }));

    return { connect, on };
  }

  // O ponto central da issue #49: importar o módulo não pode abrir conexão.
  // Enquanto isso acontecia, até o teardown dos testes (que importa o pool só
  // para fechá-lo) abria uma conexão nova, deixando um handle preso e
  // impedindo o processo do Jest de encerrar.
  it('should not open a connection just because the module was imported', async () => {
    const { connect } = mockPg({});

    await import('@shared/infra/database');

    expect(connect).not.toHaveBeenCalled();
  });

  it('should connect and release the client when the check is explicitly called', async () => {
    const release = jest.fn();
    const { connect } = mockPg({
      connect: jest.fn().mockResolvedValue({ release }),
    });

    const { checkDatabaseConnection } = await import('@shared/infra/database');
    await checkDatabaseConnection();

    expect(connect).toHaveBeenCalledTimes(1);
    // Sem o release, essa conexão de teste ficaria presa no pool para sempre.
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('should report a failed connectivity check without throwing', async () => {
    mockPg({
      connect: jest.fn().mockRejectedValue(new Error('conexão recusada')),
    });

    const { checkDatabaseConnection } = await import('@shared/infra/database');

    await expect(checkDatabaseConnection()).resolves.toBeUndefined();
  });

  it('should not crash the process when the pool emits an unexpected error on an idle client', async () => {
    let errorHandler: ((err: Error) => void) | undefined;
    mockPg({
      on: jest.fn((event: string, handler: (err: Error) => void) => {
        if (event === 'error') errorHandler = handler;
      }),
    });

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit não deveria ser chamado');
    }) as never);

    await import('@shared/infra/database');

    expect(errorHandler).toBeDefined();
    expect(() => errorHandler?.(new Error('conexão derrubada'))).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
