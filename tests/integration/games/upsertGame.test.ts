import { http, HttpResponse, JsonBodyType } from 'msw';
import { pool } from '@shared/infra/database';
import { UpsertGameService } from '@modules/games/services/UpsertGameService';
import { clearDatabase, closeDatabase } from '@tests/helpers/database';
import { server } from '@tests/helpers/msw/server';

// Payload no formato bruto da IGDB — é o que o MSW devolve e o que o
// IgdbService precisa saber traduzir.
const igdbGamePayload = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  cover: { id: 10, image_id: 'co1wyy' },
  first_release_date: 1431993600, // 2015-05-19
  summary: 'An epic RPG.',
  platforms: [
    { id: 6, name: 'PC (Microsoft Windows)', slug: 'win' },
    { id: 48, name: 'PlayStation 4', slug: 'ps4' },
  ],
  release_dates: [
    { date: 1433203200, platform: 6 }, // 2015-06-02 (região mais tardia)
    { date: 1431993600, platform: 6 }, // 2015-05-19 (a mais antiga do PC)
    { date: 1447200000, platform: 48 }, // 2015-11-11 (PS4)
  ],
};

let igdbCallCount = 0;
let requestedIgdbIds: number[] = [];

const mockIgdbGame = (payload: JsonBodyType) =>
  http.post('https://api.igdb.com/v4/games', () => {
    igdbCallCount++;
    return HttpResponse.json(payload);
  });

// Responde cada chamada com o payload do id pedido na query, e registra a
// ordem dos ids pedidos. Os testes de edição precisam de respostas diferentes
// para a edição e para o jogo de origem — o `mockIgdbGame` acima devolve o
// mesmo payload para qualquer id.
const mockIgdbGamesById = (payloads: Record<number, JsonBodyType>) =>
  http.post('https://api.igdb.com/v4/games', async ({ request }) => {
    igdbCallCount++;
    const body = await request.text();
    const match = body.match(/where id = (\d+);/);

    // Se o formato da query mudar e o id não for achado, falha alto. Devolver
    // [] faria o service concluir que o jogo não existe — os testes
    // quebrariam com um erro enganoso, ou pior, passariam pelo motivo errado.
    if (!match) {
      throw new Error(`mockIgdbGamesById: id não encontrado na query: ${body}`);
    }

    const id = Number(match[1]);
    requestedIgdbIds.push(id);

    const payload = payloads[id];
    return HttpResponse.json(payload ? [payload] : []);
  });

// Edições reais do Witcher 3 na IGDB (ids e tipos conferidos na issue #55),
// só com os campos obrigatórios e o vínculo com o jogo de origem.
const collectorsEdition = {
  id: 44549,
  name: "The Witcher 3: Wild Hunt - Collector's Edition",
  slug: 'the-witcher-3-wild-hunt-collectors-edition',
  version_parent: 1942,
  game_type: 0, // Main Game
};

const gotyEdition = {
  id: 22439,
  name: 'The Witcher 3: Wild Hunt - Game of the Year Edition',
  slug: 'the-witcher-3-wild-hunt-game-of-the-year-edition',
  version_parent: 1942,
  game_type: 3, // Bundle
};

// `release_date` é DATE, e o driver está configurado para devolvê-la como
// 'YYYY-MM-DD' cru (ver setTypeParser em shared/infra/database/index.ts) —
// não precisa mais de conversão defensiva de fuso aqui.
async function releaseDateOf(platformId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT release_date FROM game_platforms WHERE platform_id = $1;`,
    [platformId],
  );

  return result.rows[0]?.release_date ?? null;
}

describe('UpsertGameService (integração)', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(async () => {
    server.close();
    await closeDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    igdbCallCount = 0;
    requestedIgdbIds = [];
  });

  it('should persist the game, its platforms and the links between them', async () => {
    server.use(mockIgdbGame([igdbGamePayload]));

    const game = await new UpsertGameService().execute(1942);

    expect(game.id_igdb).toBe(1942);
    expect(game.title).toBe('The Witcher 3: Wild Hunt');
    expect(game.slug).toBe('the-witcher-3-wild-hunt');
    expect(game.cover_image_id).toBe('co1wyy');
    expect(game.summary).toBe('An epic RPG.');
    // Prova de ponta a ponta do setTypeParser: sem ele, isso viria como um
    // objeto Date em meia-noite no fuso local, não a string 'YYYY-MM-DD'.
    expect(game.first_release_date).toBe('2015-05-19');

    const platforms = await pool.query(
      'SELECT id_igdb, name, slug FROM platforms ORDER BY id_igdb;',
    );
    expect(platforms.rows).toEqual([
      { id_igdb: 6, name: 'PC (Microsoft Windows)', slug: 'win' },
      { id_igdb: 48, name: 'PlayStation 4', slug: 'ps4' },
    ]);

    const links = await pool.query(
      'SELECT game_id, platform_id FROM game_platforms ORDER BY platform_id;',
    );
    expect(links.rows).toEqual([
      { game_id: 1942, platform_id: 6 },
      { game_id: 1942, platform_id: 48 },
    ]);
  });

  // O ponto central da issue #9: rodar duas vezes tem que dar no mesmo.
  it('should be idempotent: running twice creates no duplicates and throws nothing', async () => {
    server.use(mockIgdbGame([igdbGamePayload]));

    const service = new UpsertGameService();
    await service.execute(1942);
    await expect(service.execute(1942)).resolves.toMatchObject({
      id_igdb: 1942,
    });

    const counts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM games) AS games,
        (SELECT count(*)::int FROM platforms) AS platforms,
        (SELECT count(*)::int FROM game_platforms) AS links;
    `);

    expect(counts.rows[0]).toEqual({ games: 1, platforms: 2, links: 2 });
  });

  // Cache-aside: uma vez que o jogo está local, a IGDB não é mais consultada.
  it('should not call IGDB again when the game is already persisted', async () => {
    server.use(mockIgdbGame([igdbGamePayload]));

    const service = new UpsertGameService();
    await service.execute(1942);
    expect(igdbCallCount).toBe(1);

    await service.execute(1942);
    expect(igdbCallCount).toBe(1);
  });

  // A IGDB devolve uma data por plataforma E por região; a coluna é uma só.
  it('should store the earliest release date of each platform', async () => {
    server.use(mockIgdbGame([igdbGamePayload]));

    await new UpsertGameService().execute(1942);

    // PC tem duas datas no payload (2015-06-02 e 2015-05-19)
    expect(await releaseDateOf(6)).toBe('2015-05-19');
    expect(await releaseDateOf(48)).toBe('2015-11-11');
  });

  it('should leave release_date null for a platform with no release date', async () => {
    server.use(
      mockIgdbGame([
        {
          ...igdbGamePayload,
          release_dates: [{ date: 1431993600, platform: 6 }],
        },
      ]),
    );

    await new UpsertGameService().execute(1942);

    expect(await releaseDateOf(6)).toBe('2015-05-19');
    expect(await releaseDateOf(48)).toBeNull();
  });

  it('should persist a game that has no platforms at all', async () => {
    server.use(
      mockIgdbGame([
        { ...igdbGamePayload, platforms: undefined, release_dates: undefined },
      ]),
    );

    const game = await new UpsertGameService().execute(1942);

    expect(game.id_igdb).toBe(1942);

    const links = await pool.query('SELECT count(*)::int FROM game_platforms;');
    expect(links.rows[0].count).toBe(0);
  });

  it('should throw a 404 AppError when IGDB does not know the game', async () => {
    server.use(mockIgdbGame([]));

    await expect(
      new UpsertGameService().execute(999999),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // Prova que a transação é real: as plataformas são inseridas antes do jogo,
  // então se o insert do jogo falhar, elas precisam desaparecer junto.
  it('should roll back the platforms when persisting the game fails', async () => {
    server.use(
      mockIgdbGame([
        { ...igdbGamePayload, name: 'x'.repeat(300) }, // estoura varchar(255)
      ]),
    );

    await expect(new UpsertGameService().execute(1942)).rejects.toThrow();

    const counts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM games) AS games,
        (SELECT count(*)::int FROM platforms) AS platforms;
    `);

    expect(counts.rows[0]).toEqual({ games: 0, platforms: 0 });
  });

  describe('edições de um mesmo jogo (issue #55)', () => {
    // O QUE VERIFICA: pedir o upsert de uma edição de colecionador grava o
    // jogo de origem — com os dados completos dele — e nunca a edição.
    //
    // POR QUE FOI CRIADO: é o comportamento central da issue #55. Sem ele,
    // "Witcher 3" e "Witcher 3 — Collector's Edition" virariam dois jogos no
    // banco, cada um com suas próprias reviews e médias.
    //
    // O QUE GARANTE: quatro coisas, uma por asserção. O jogo devolvido é o de
    // origem (1942), não o pedido (44549); a IGDB foi consultada primeiro
    // pela edição e depois pela origem, nessa ordem; a tabela `games` tem só
    // a origem, sem linha nenhuma para a edição; e os vínculos com
    // plataformas vieram do payload da origem (a edição do mock não tem
    // plataforma nenhuma) — ou seja, o que foi gravado é o jogo de origem de
    // verdade, não a edição com o id trocado.
    it("should persist the original game instead of a collector's edition", async () => {
      server.use(
        mockIgdbGamesById({ 44549: collectorsEdition, 1942: igdbGamePayload }),
      );

      const game = await new UpsertGameService().execute(44549);

      expect(game.id_igdb).toBe(1942);
      expect(requestedIgdbIds).toEqual([44549, 1942]);

      const games = await pool.query('SELECT id_igdb FROM games;');
      expect(games.rows).toEqual([{ id_igdb: 1942 }]);

      const links = await pool.query(
        'SELECT count(*)::int FROM game_platforms WHERE game_id = 1942;',
      );
      expect(links.rows[0].count).toBe(2);
    });

    // O QUE VERIFICA: uma GOTY Edition — que a IGDB tipa como Bundle, não
    // como Main Game — também é redirecionada para o jogo de origem.
    //
    // POR QUE FOI CRIADO: foi o caso que motivou a issue ("uma versão que
    // venha com todas as DLCs"), e é exatamente o que uma regra ingênua
    // (redirecionar só quando game_type é Main Game) deixaria passar. Este
    // teste existe para essa regra ingênua nunca voltar.
    //
    // O QUE GARANTE: que Bundle está de fato na lista de tipos aceitos.
    it('should also redirect a GOTY edition, which IGDB types as Bundle', async () => {
      server.use(
        mockIgdbGamesById({ 22439: gotyEdition, 1942: igdbGamePayload }),
      );

      const game = await new UpsertGameService().execute(22439);

      expect(game.id_igdb).toBe(1942);
    });

    // O QUE VERIFICA: se o jogo de origem já está no banco, pedir uma edição
    // dele não gera uma segunda chamada à IGDB.
    //
    // POR QUE FOI CRIADO: edições nunca são gravadas, então a primeira
    // checagem de cache sempre falha para elas — a checagem feita depois de
    // descobrir o id de origem é a chance real de economizar a chamada.
    // Sem este teste, essa segunda checagem poderia ser removida sem nenhum
    // teste acusar, e o upsert continuaria "funcionando" (só gastando uma
    // chamada a mais toda vez).
    //
    // O QUE GARANTE: a sequência exata de ids pedidos à IGDB — 1942 no
    // primeiro upsert, 44549 no segundo, e nenhum 1942 repetido.
    it('should not call IGDB for the original game when it is already persisted', async () => {
      server.use(
        mockIgdbGamesById({ 44549: collectorsEdition, 1942: igdbGamePayload }),
      );

      const service = new UpsertGameService();
      await service.execute(1942);
      const game = await service.execute(44549);

      expect(game.id_igdb).toBe(1942);
      expect(requestedIgdbIds).toEqual([1942, 44549]);
    });

    // O QUE VERIFICA: uma entrada com `version_parent`, mas de um tipo fora
    // da lista aceita (ou sem tipo informado), é gravada como jogo próprio.
    //
    // POR QUE FOI CRIADO: é a proteção contra dado contraditório — o motivo
    // de checar `game_type` além de `version_parent`. Um Remaster marcado
    // como "edição" pela IGDB seria um erro dela, e mesclar suas reviews com
    // as do jogo original misturaria avaliações de experiências diferentes —
    // justamente o que você excluiu ao dizer que remasters são outra coisa.
    // Os três casos cobrem os dois lados da condição: tipo presente mas não
    // aceito (Remaster, DLC) e tipo ausente.
    //
    // O QUE GARANTE: que a entrada é gravada com o próprio id e que a IGDB
    // não é consultada uma segunda vez pelo id de origem.
    it.each<[string, number | undefined]>([
      ['Remaster', 9],
      ['DLC', 1],
      ['sem game_type', undefined],
    ])(
      'should not merge an entry typed %s even when it has version_parent',
      async (_label, gameType) => {
        const contradictory = {
          id: 999001,
          name: 'Entrada contraditória',
          slug: 'entrada-contraditoria',
          version_parent: 1942,
          ...(gameType === undefined ? {} : { game_type: gameType }),
        };

        server.use(
          mockIgdbGamesById({ 999001: contradictory, 1942: igdbGamePayload }),
        );

        const game = await new UpsertGameService().execute(999001);

        expect(game.id_igdb).toBe(999001);
        expect(requestedIgdbIds).toEqual([999001]);
      },
    );

    // O QUE VERIFICA: se o `version_parent` aponta para um jogo que a IGDB
    // não encontra, o upsert falha com 503 e não grava nada.
    //
    // POR QUE FOI ALTERADO: a primeira versão deste teste esperava o
    // contrário — que a própria edição fosse gravada, como "na dúvida, não
    // mesclar". O code-review mostrou o problema: gravar é permanente. A
    // checagem de cache devolveria a edição para sempre, e se o jogo de
    // origem tivesse sumido da IGDB só temporariamente, a fragmentação que a
    // issue #55 evita ficaria congelada no banco. Falhar sem gravar deixa a
    // próxima tentativa decidir de novo.
    //
    // O QUE GARANTE: que a IGDB foi consultada pela origem antes de desistir,
    // que o erro é 503 (problema do lado da IGDB, não do cliente), e que a
    // tabela `games` continua vazia.
    it('should fail without persisting anything when the original game is not found on IGDB', async () => {
      server.use(mockIgdbGamesById({ 44549: collectorsEdition }));

      await expect(
        new UpsertGameService().execute(44549),
      ).rejects.toMatchObject({ statusCode: 503 });
      expect(requestedIgdbIds).toEqual([44549, 1942]);

      const games = await pool.query('SELECT count(*)::int FROM games;');
      expect(games.rows[0].count).toBe(0);
    });

    // O QUE VERIFICA: quando o jogo de origem também é uma edição, o upsert
    // segue a cadeia até chegar num jogo que não seja edição de nenhum outro.
    //
    // POR QUE FOI CRIADO: achado do code-review. Nenhuma cadeia assim
    // apareceu nos dados reais, mas se aparecer, parar no primeiro salto
    // gravaria a edição intermediária como se fosse o jogo — e um upsert
    // futuro do jogo de verdade criaria uma segunda linha. Mesma
    // fragmentação, permanente.
    //
    // O QUE GARANTE: a ordem de consulta (edição da edição → edição → jogo)
    // e que só o jogo do fim da cadeia é gravado.
    it('should follow a chain of editions until reaching a game that is not an edition', async () => {
      const editionOfEdition = {
        id: 900001,
        name: 'Edição de uma edição',
        slug: 'edicao-de-uma-edicao',
        version_parent: 44549, // aponta para a Collector's Edition
        game_type: 0,
      };

      server.use(
        mockIgdbGamesById({
          900001: editionOfEdition,
          44549: collectorsEdition,
          1942: igdbGamePayload,
        }),
      );

      const game = await new UpsertGameService().execute(900001);

      expect(game.id_igdb).toBe(1942);
      expect(requestedIgdbIds).toEqual([900001, 44549, 1942]);

      const games = await pool.query('SELECT id_igdb FROM games;');
      expect(games.rows).toEqual([{ id_igdb: 1942 }]);
    });

    // O QUE VERIFICA: se as edições formam um ciclo (A edição de B, B edição
    // de A), o upsert termina com 503 em vez de rodar para sempre.
    //
    // POR QUE FOI CRIADO: é a outra face de seguir a cadeia — sem o limite de
    // redirecionamentos, um dado circular da IGDB travaria a requisição
    // indefinidamente. O próprio teste terminar já prova que o loop é finito.
    //
    // O QUE GARANTE: que o erro é 503 e que nada é gravado. A quantidade
    // exata de chamadas não é verificada de propósito — ela depende do valor
    // do limite, que é detalhe de implementação.
    it('should fail without persisting anything when editions form a cycle', async () => {
      server.use(
        mockIgdbGamesById({
          900001: {
            id: 900001,
            name: 'Ciclo A',
            slug: 'ciclo-a',
            version_parent: 900002,
            game_type: 0,
          },
          900002: {
            id: 900002,
            name: 'Ciclo B',
            slug: 'ciclo-b',
            version_parent: 900001,
            game_type: 0,
          },
        }),
      );

      await expect(
        new UpsertGameService().execute(900001),
      ).rejects.toMatchObject({ statusCode: 503 });

      const games = await pool.query('SELECT count(*)::int FROM games;');
      expect(games.rows[0].count).toBe(0);
    });
  });
});
