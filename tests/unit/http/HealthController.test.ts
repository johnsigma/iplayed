import { Request, Response } from 'express';

// O pool é mockado aqui porque os testes de falha e de lentidão precisam
// simular um banco que não responde — algo que o banco real do teste de
// integração não tem como fazer sob demanda. O caminho feliz com banco de
// verdade está em tests/integration/health/health.test.ts.
function createResponse() {
  const res = {
    set: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  return { res, asResponse: res as unknown as Response };
}

const req = {} as Request;

async function loadController(query: jest.Mock, timeoutMs?: number) {
  jest.doMock('@shared/infra/database', () => ({ pool: { query } }));

  const { HealthController } = await import(
    '@shared/infra/http/controllers/HealthController'
  );

  return new HealthController(timeoutMs);
}

describe('HealthController', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  describe('live', () => {
    // O QUE VERIFICA: a liveness responde 200 sem tocar no banco.
    //
    // POR QUE FOI CRIADO: é a regra que define o que liveness é. Quem
    // consome é o orquestrador, que reinicia o processo se ela falhar — se
    // ela consultasse o banco, uma oscilação dele faria a aplicação ser
    // reiniciada em loop, sem que o processo tivesse problema nenhum.
    //
    // O QUE GARANTE: que `pool.query` nunca é chamado. Um futuro "já que
    // estamos aqui, vamos checar o banco também" quebraria este teste.
    it('should answer 200 without touching the database', async () => {
      const query = jest.fn();
      const { res, asResponse } = createResponse();
      const controller = await loadController(query);

      controller.live(req, asResponse);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
      expect(query).not.toHaveBeenCalled();
    });

    // O QUE VERIFICA: a resposta leva `Cache-Control: no-store`.
    //
    // POR QUE FOI CRIADO: um proxy ou CDN que guardasse a resposta em cache
    // continuaria dizendo "ok" depois que a aplicação caísse — a sonda
    // mentiria. É convenção de endpoints de saúde.
    //
    // O QUE GARANTE: que o cabeçalho está presente.
    it('should forbid caching of the response', async () => {
      const { res, asResponse } = createResponse();
      const controller = await loadController(jest.fn());

      controller.live(req, asResponse);

      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });
  });

  describe('ready', () => {
    // O QUE VERIFICA: com o banco respondendo, a readiness devolve 200 e o
    // `SELECT 1` é de fato executado.
    //
    // POR QUE FOI CRIADO: garante que a sonda pergunta ao banco em vez de
    // responder "ok" por padrão.
    //
    // O QUE GARANTE: a query mínima foi chamada, e o corpo é só
    // `{ status: 'ok' }` — sem versão do banco nem contagem de conexões,
    // que eram expostas publicamente no `/status` antigo.
    it('should answer 200 with a minimal body when the database responds', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
      const { res, asResponse } = createResponse();
      const controller = await loadController(query);

      await controller.ready(req, asResponse);

      expect(query).toHaveBeenCalledWith('SELECT 1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    });

    // O QUE VERIFICA: se o banco rejeita a query, a readiness devolve 503 e
    // não vaza a mensagem do erro.
    //
    // POR QUE FOI CRIADO: 503 diz ao load balancer "pare de mandar tráfego".
    // E a mensagem do driver (host, usuário, porta) é exatamente o tipo de
    // detalhe que não deve sair numa rota pública (ver #47).
    //
    // O QUE GARANTE: o status 503, o corpo `{ status: 'error' }` sem a
    // mensagem original, e que o erro foi para o log do servidor — onde a
    // pessoa de operação consegue ver a causa.
    it('should answer 503 without leaking the error when the database fails', async () => {
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const query = jest
        .fn()
        .mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
      const { res, asResponse } = createResponse();
      const controller = await loadController(query);

      await controller.ready(req, asResponse);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ status: 'error' });
      expect(JSON.stringify(res.json.mock.calls)).not.toContain('ECONNREFUSED');
      expect(logSpy).toHaveBeenCalled();
    });

    // O QUE VERIFICA: se o banco não responde dentro do limite, a readiness
    // devolve 503 em vez de ficar pendurada.
    //
    // POR QUE FOI CRIADO: o `pg` não tem timeout de conexão por padrão — com
    // o pool esgotado, a query nunca volta. Uma sonda que não responde é
    // tratada como falha pelo load balancer, só que muito mais devagar.
    // Aqui a query nunca resolve, e o limite é de 20ms para o teste não
    // esperar os 2s de produção.
    //
    // O QUE GARANTE: que o limite existe e funciona. Se o `withTimeout`
    // fosse removido, este teste ficaria pendurado até o Jest desistir.
    it('should answer 503 when the database does not respond in time', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const query = jest.fn().mockReturnValue(new Promise(() => {}));
      const { res, asResponse } = createResponse();
      const controller = await loadController(query, 20);

      await controller.ready(req, asResponse);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ status: 'error' });
    });

    // O QUE VERIFICA: a readiness também proíbe cache, nos dois resultados.
    //
    // POR QUE FOI CRIADO: mesma razão da liveness — e aqui é pior, porque
    // um "ok" em cache esconderia justamente a queda do banco.
    //
    // O QUE GARANTE: o cabeçalho presente tanto no caminho de sucesso
    // quanto no de falha.
    it.each([
      ['success', jest.fn().mockResolvedValue({ rows: [] })],
      ['failure', jest.fn().mockRejectedValue(new Error('down'))],
    ])('should forbid caching on %s', async (_label, query) => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { res, asResponse } = createResponse();
      const controller = await loadController(query);

      await controller.ready(req, asResponse);

      expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });
  });
});
