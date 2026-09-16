import { http, HttpResponse, JsonBodyType } from 'msw';
import request from 'supertest';
import { app } from '@shared/infra/http/app';
import { closeDatabase } from '@tests/helpers/database';
import { bypassLocalRequests, server } from '@tests/helpers/msw/server';

// Payload no formato bruto da IGDB — o mesmo formato usado nos testes do
// IgdbService, porque é exatamente o que o MSW precisa devolver para simular
// a API de verdade.
const mockIgdbGame = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  cover: { id: 10, image_id: 'co1wyy' },
  first_release_date: 1431993600, // 2015-05-19
  platforms: [{ id: 6, name: 'PC (Microsoft Windows)', slug: 'win' }],
};

const mockIgdbGamesResponse = (games: JsonBodyType) =>
  http.post('https://api.igdb.com/v4/games', () => HttpResponse.json(games));

describe('GET /api/v1/games/search (integração)', () => {
  // `onUnhandledRequest: bypassLocalRequests` silencia o aviso do MSW sobre
  // as próprias chamadas do supertest ao servidor local, sem esconder um
  // aviso real caso algum endpoint externo fique sem handler (ver
  // bypassLocalRequests em tests/helpers/msw/server.ts).
  beforeAll(() => server.listen({ onUnhandledRequest: bypassLocalRequests }));
  afterEach(() => server.resetHandlers());
  afterAll(async () => {
    server.close();
    // Este endpoint não faz nenhuma query no banco, mas `app` carrega as
    // rotas de /status também, que importam o módulo de banco — fechar o
    // pool aqui é o mesmo cuidado de todo teste de integração (ver #49).
    await closeDatabase();
  });

  // O QUE VERIFICA: uma busca válida devolve 200 com a lista de jogos já
  // traduzida para o formato do projeto (cover_image_id em vez de
  // cover.image_id, first_release_date como 'YYYY-MM-DD', etc.) — não o
  // formato bruto da IGDB.
  //
  // POR QUE FOI CRIADO: é o caminho feliz do endpoint, tarefa explícita da
  // #28 ("Testar resposta 200 com lista de jogos quando a busca retorna
  // resultados").
  //
  // O QUE GARANTE: prova a integração de ponta a ponta — rota → controller →
  // IgdbService → resposta HTTP. Isso é diferente do que os testes unitários
  // do IgdbService garantem: aqueles provam que o service traduz certo, mas
  // não passam pelo Express de verdade. Um erro de import errado no
  // controller, uma rota mal registrada, ou um `req.query.q` lido do campo
  // errado, não apareceriam nos testes unitários — só aqui. Também captura o
  // corpo da requisição feita à IGDB para confirmar que o `q` da URL chegou
  // até lá sem se perder no meio do caminho.
  it('should return 200 with the translated game list when IGDB finds results', async () => {
    let capturedIgdbRequestBody = '';

    server.use(
      http.post(
        'https://api.igdb.com/v4/games',
        async ({ request: igdbRequest }) => {
          capturedIgdbRequestBody = await igdbRequest.text();
          return HttpResponse.json([mockIgdbGame]);
        },
      ),
    );

    const response = await request(app).get(
      '/api/v1/games/search?q=witcher',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: 1942,
        name: 'The Witcher 3: Wild Hunt',
        slug: 'the-witcher-3-wild-hunt',
        cover_image_id: 'co1wyy',
        first_release_date: '2015-05-19',
        platforms: [{ id: 6, name: 'PC (Microsoft Windows)', slug: 'win' }],
      },
    ]);
    expect(capturedIgdbRequestBody).toContain('search "witcher";');
  });

  // O QUE VERIFICA: uma busca que não encontra nada devolve 200 com array
  // vazio — não 404, não erro.
  //
  // POR QUE FOI CRIADO: tarefa explícita da #28. Também documenta uma
  // decisão de design que vale deixar explícita: "a busca funcionou e não
  // achou nada" é um resultado de sucesso, diferente de "a busca falhou".
  //
  // O QUE GARANTE: nenhum ponto do caminho (controller ou service) trata
  // lista vazia como condição de erro. Sem este teste, alguém poderia
  // adicionar um dia um `if (games.length === 0) throw ...` achando que
  // fazia sentido, e isso quebraria silenciosamente sem teste nenhum
  // acusando.
  it('should return 200 with an empty list when IGDB finds nothing', async () => {
    server.use(mockIgdbGamesResponse([]));

    const response = await request(app).get(
      '/api/v1/games/search?q=xyzxyzxyz',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  // O QUE VERIFICA: sem o parâmetro `q`, a requisição é rejeitada com 400
  // antes de qualquer chamada à IGDB.
  //
  // POR QUE FOI CRIADO: tarefa explícita da #28, cobrindo a regra "q é
  // obrigatório" da #44.
  //
  // O QUE GARANTE: duas coisas ao mesmo tempo, por isso duas asserções. A
  // primeira (status 400) prova que a validação Zod está de fato conectada
  // ao endpoint. A segunda (igdbWasCalled === false) prova a parte mais
  // importante da #44: "sem chegar ao service da IGDB" — ou seja, a validação
  // roda ANTES da chamada externa, não depois. Sem essa segunda asserção, um
  // bug que validasse só depois de já ter gastado a chamada passaria batido.
  it('should return 400 when q is missing, without calling IGDB', async () => {
    let igdbWasCalled = false;

    server.use(
      http.post('https://api.igdb.com/v4/games', () => {
        igdbWasCalled = true;
        return HttpResponse.json([]);
      }),
    );

    const response = await request(app).get('/api/v1/games/search');

    expect(response.status).toBe(400);
    expect(igdbWasCalled).toBe(false);
  });

  // O QUE VERIFICA: um `q` de 1 caractere (abaixo do mínimo de 2 da #44) é
  // rejeitado com 400.
  //
  // POR QUE FOI CRIADO: tarefa explícita da #28, cobrindo especificamente a
  // regra de tamanho mínimo — o teste anterior cobre "ausente", este cobre
  // "presente mas curto demais", que é uma falha de validação diferente.
  //
  // O QUE GARANTE: o `.min(2)` declarado no schema está de fato ativo nesse
  // endpoint. Sem este teste, seria possível remover o `.min(2)` do schema
  // (ou trocar por `.min(1)` por engano) sem nenhum teste acusando a
  // regressão.
  it('should return 400 when q is shorter than 2 characters', async () => {
    const response = await request(app).get('/api/v1/games/search?q=a');

    expect(response.status).toBe(400);
  });

  // O QUE VERIFICA: um `limit` fora do intervalo 1–50 é rejeitado com 400,
  // em vez de silenciosamente ajustado para o valor mais próximo.
  //
  // POR QUE FOI CRIADO: não está no texto original da #28 (que foi escrita
  // antes de decidirmos expor `limit`) — este teste existe como consequência
  // direta dessa decisão, para o parâmetro novo não ficar sem cobertura no
  // nível HTTP.
  //
  // O QUE GARANTE: a distinção entre duas políticas parecidas, mas
  // diferentes, que convivem no mesmo fluxo. O `IgdbService.clampSearchLimit`
  // AJUSTA valores fora do intervalo (é uma proteção interna, silenciosa,
  // para chamadas internas confiáveis). Este endpoint, por sua vez, REJEITA
  // valores fora do intervalo com 400 (é a fronteira com um cliente HTTP não
  // confiável, que deve saber que mandou algo inválido). Sem este teste, não
  // haveria prova de qual das duas políticas está de fato em vigor na
  // fronteira HTTP.
  it('should return 400 when limit is out of the 1-50 range', async () => {
    const response = await request(app).get(
      '/api/v1/games/search?q=witcher&limit=999',
    );

    expect(response.status).toBe(400);
  });
});
