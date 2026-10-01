import request from 'supertest';
import { app } from '@shared/infra/http/app';
import { closeDatabase } from '@tests/helpers/database';

afterAll(closeDatabase);

describe('Health endpoints (integração)', () => {
  // O QUE VERIFICA: GET /health/live responde 200 `{ status: 'ok' }`, sem
  // cache.
  //
  // POR QUE FOI CRIADO: prova a rota de ponta a ponta pelo Express de
  // verdade — rota registrada, no caminho certo (fora de /api/v1), com o
  // cabeçalho. Os testes unitários chamam o controller direto e não
  // enxergam um erro de registro de rota.
  //
  // O QUE GARANTE: que a sonda que o orquestrador vai usar existe e
  // responde no endereço combinado.
  it('GET /health/live should answer 200 and forbid caching', async () => {
    const response = await request(app).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  // O QUE VERIFICA: com o Postgres real de pé, GET /health/ready responde
  // 200 com corpo exatamente `{ status: 'ok' }`.
  //
  // POR QUE FOI CRIADO: é o único teste que prova que a readiness
  // consegue de fato falar com o banco — o unitário usa um pool falso. O
  // `toEqual` exato também é a proteção contra o vazamento do `/status`
  // antigo: se alguém voltar a acrescentar versão do banco ou número de
  // conexões nessa rota pública, o teste quebra.
  //
  // O QUE GARANTE: a integração real rota → controller → pool → Postgres.
  it('GET /health/ready should answer 200 with a minimal body when the database is up', async () => {
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  // O QUE VERIFICA: o endpoint antigo `/api/v1/status` não existe mais.
  //
  // POR QUE FOI CRIADO: ele expunha publicamente a versão do banco e o
  // número de conexões. Se voltar por engano (um merge, um revert), este
  // teste acusa.
  //
  // O QUE GARANTE: 404 na rota removida.
  it('GET /api/v1/status should no longer exist', async () => {
    const response = await request(app).get('/api/v1/status');

    expect(response.status).toBe(404);
  });
});
