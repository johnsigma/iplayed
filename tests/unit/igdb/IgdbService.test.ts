import { delay, http, HttpResponse, JsonBodyType } from 'msw';
import { IgdbService } from '@shared/infra/igdb/IgdbService';
import { server } from '@tests/helpers/msw/server';

const mockGame = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  cover: { id: 10, image_id: 'co1wyy' },
  first_release_date: 1431993600,
  platforms: [{ id: 6, name: 'PC (Microsoft Windows)', slug: 'win' }],
};

const igdbGames = (games: JsonBodyType) =>
  http.post('https://api.igdb.com/v4/games', () => HttpResponse.json(games));

const igdbGamesError = (body: JsonBodyType, status = 503) =>
  http.post('https://api.igdb.com/v4/games', () =>
    HttpResponse.json(body, { status }),
  );

const twitchToken = (body: JsonBodyType, status = 200) =>
  http.post('https://id.twitch.tv/oauth2/token', () =>
    HttpResponse.json(body, { status }),
  );

describe('IgdbService', () => {
  beforeAll(() => server.listen()); // Inicia o servidor MSW antes de todos os testes
  afterEach(() => server.resetHandlers()); // Reseta os handlers após cada teste para evitar interferências
  afterAll(() => server.close()); // Fecha o servidor MSW após todos os testes

  describe('constructor', () => {
    it('should launch where any environment variables are missing', () => {
      const original = process.env.TWITCH_CLIENT_ID;

      try {
        delete process.env.TWITCH_CLIENT_ID;
        expect(() => new IgdbService()).toThrow(
          'Twitch/IGDB environment variables missing: TWITCH_CLIENT_ID',
        );
      } finally {
        process.env.TWITCH_CLIENT_ID = original;
      }
    });

    it('should throw an error when both environment variables are missing', () => {
      const origId = process.env.TWITCH_CLIENT_ID;
      const origSecret = process.env.TWITCH_CLIENT_SECRET;

      try {
        delete process.env.TWITCH_CLIENT_ID;
        delete process.env.TWITCH_CLIENT_SECRET;
        expect(() => new IgdbService()).toThrow(
          'Twitch/IGDB environment variables missing: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET',
        );
      } finally {
        process.env.TWITCH_CLIENT_ID = origId;
        process.env.TWITCH_CLIENT_SECRET = origSecret;
      }
    });
  });

  describe('searchGames', () => {
    it('should return an transformed array when the API returns valid data', async () => {
      // Mocka a resposta da API do IGDB para retornar um jogo específico
      server.use(igdbGames([mockGame]));
      const service = new IgdbService();
      const results = await service.searchGames('witcher');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 1942,
        name: 'The Witcher 3: Wild Hunt',
        slug: 'the-witcher-3-wild-hunt',
        cover_image_id: 'co1wyy',
        first_release_date: '2015-05-19T00:00:00.000Z',
        platforms: [{ id: 6, name: 'PC (Microsoft Windows)', slug: 'win' }],
      });
    });

    // `platforms.slug` é NOT NULL no nosso banco, então uma plataforma sem
    // slug não teria como ser persistida. A escolha aqui é descartar a
    // plataforma e manter o jogo, em vez de reprovar a resposta inteira.
    it('should drop platforms that have no slug instead of failing the whole game', async () => {
      server.use(
        igdbGames([
          {
            ...mockGame,
            platforms: [
              { id: 6, name: 'PC (Microsoft Windows)', slug: 'win' },
              { id: 999, name: 'Plataforma Sem Slug' },
            ],
          },
        ]),
      );

      const service = new IgdbService();
      const results = await service.searchGames('witcher');

      expect(results[0].platforms).toEqual([
        { id: 6, name: 'PC (Microsoft Windows)', slug: 'win' },
      ]);
    });

    it('should set optional fields to null when they are missing in the API response', async () => {
      server.use(
        igdbGames([{ id: 1, name: 'Minimum Game', slug: 'minimum-game' }]),
      );

      const service = new IgdbService();
      const results = await service.searchGames('game');

      expect(results[0].cover_image_id).toBeNull();
      expect(results[0].first_release_date).toBeNull();
      expect(results[0].platforms).toEqual([]);
    });

    it('should throw an AppError 503 when Twitch authentication fails', async () => {
      server.use(twitchToken({ message: 'Unauthorized' }, 401));

      const service = new IgdbService();
      await expect(service.searchGames('witcher')).rejects.toMatchObject({
        statusCode: 503,
      });
    });

    it('should throw an AppError 503 when IGDB returns an error', async () => {
      server.use(igdbGamesError({ message: 'Service Unavailable' }, 503));

      const service = new IgdbService();
      await expect(service.searchGames('witcher')).rejects.toMatchObject({
        statusCode: 503,
      });
    });

    it('should throw an AppError 503 when IGDB returns an unexpected shape', async () => {
      // status 200 explícito é essencial aqui: o default de `igdbGamesError`
      // é 503, o que faria o teste passar pelo branch `!response.ok` em vez
      // do branch de validação do Zod que este teste diz estar cobrindo.
      server.use(igdbGamesError({ unexpected: 'shape' }, 200));

      const service = new IgdbService();
      await expect(service.searchGames('witcher')).rejects.toMatchObject({
        statusCode: 503,
      });
    });

    it('should reutilize the token in subsequent requests', async () => {
      let tokenRequestCount = 0;

      server.use(
        http.post('https://id.twitch.tv/oauth2/token', () => {
          tokenRequestCount++;
          return HttpResponse.json({
            access_token: 'mock_access_token',
            expires_in: 3600,
            token_type: 'bearer',
          });
        }),
      );

      const service = new IgdbService();
      await service.searchGames('witcher');
      await service.searchGames('bloodborne');
      expect(tokenRequestCount).toBe(1);
    });

    // Testa a outra metade do comportamento esperado pela issue #8: quando o
    // token expira, a próxima chamada deve buscar um novo automaticamente.
    // Em vez de esperar 1 hora de verdade, fazemos o Date.now() "mentir" para
    // simular a passagem do tempo apenas dentro deste teste.
    it('should fetch a new token after the previous one expires', async () => {
      let tokenRequestCount = 0;

      server.use(
        http.post('https://id.twitch.tv/oauth2/token', () => {
          tokenRequestCount++;
          return HttpResponse.json({
            access_token: `mock_access_token_${tokenRequestCount}`,
            expires_in: 3600, // 1 hora de validade
            token_type: 'bearer',
          });
        }),
      );

      const realNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);

      const service = new IgdbService();

      await service.searchGames('witcher');
      expect(tokenRequestCount).toBe(1);

      // Avança "o relógio" para além da validade do token (3600s), sem
      // esperar de verdade.
      nowSpy.mockReturnValue(realNow + 3600 * 1000);

      await service.searchGames('bloodborne');
      expect(tokenRequestCount).toBe(2);

      nowSpy.mockRestore();
    });

    it('should escape double quotes in the search query to prevent APIcalypse injection', async () => {
      let capturedBody = '';

      server.use(
        http.post('https://api.igdb.com/v4/games', async ({ request }) => {
          capturedBody = await request.text();
          return HttpResponse.json([]);
        }),
      );

      const service = new IgdbService();
      const maliciousQuery = 'foo"; where id = 1; fields *; "';
      await service.searchGames(maliciousQuery);

      // A query enviada deve conter as aspas escapadas, não as aspas cruas
      // do input — ou seja, o valor não conseguiu "fechar" a string antes da
      // hora.
      const expectedEscaped = maliciousQuery
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
      expect(capturedBody).toContain(`search "${expectedEscaped}";`);
      expect(capturedBody).not.toContain('search "foo"; where id = 1;');
    });

    it('should use a custom limit when provided', async () => {
      let capturedBody = '';

      server.use(
        http.post('https://api.igdb.com/v4/games', async ({ request }) => {
          capturedBody = await request.text();
          return HttpResponse.json([]);
        }),
      );

      const service = new IgdbService();
      await service.searchGames('witcher', 5);

      expect(capturedBody).toContain('limit 5;');
    });

    it('should clamp the limit to a safe maximum', async () => {
      let capturedBody = '';

      server.use(
        http.post('https://api.igdb.com/v4/games', async ({ request }) => {
          capturedBody = await request.text();
          return HttpResponse.json([]);
        }),
      );

      const service = new IgdbService();
      await service.searchGames('witcher', 500);

      expect(capturedBody).toContain(`limit ${50};`);
    });

    it('should throw an AppError 503 when the underlying network request fails', async () => {
      server.use(
        http.post('https://api.igdb.com/v4/games', () => HttpResponse.error()),
      );

      const service = new IgdbService();
      await expect(service.searchGames('witcher')).rejects.toMatchObject({
        statusCode: 503,
      });
    });

    // Sem validar o corpo do token, `expires_in` ausente viraria NaN em
    // tokenExpiresAt e o cache de token pararia de funcionar em silêncio —
    // o service passaria a pedir token novo a cada chamada.
    it('should throw an AppError 503 when the Twitch token response has an unexpected shape', async () => {
      server.use(twitchToken({ unexpected: 'shape' }, 200));

      const service = new IgdbService();
      await expect(service.searchGames('witcher')).rejects.toMatchObject({
        statusCode: 503,
      });
    });

    // Recuperação automática de credencial rotacionada/revogada: sem isso, o
    // token inválido continuaria em cache até expirar de verdade.
    it('should discard the cached token and retry once when IGDB answers 401', async () => {
      let tokenRequestCount = 0;
      let gamesRequestCount = 0;

      server.use(
        http.post('https://id.twitch.tv/oauth2/token', () => {
          tokenRequestCount++;
          return HttpResponse.json({
            access_token: `token_${tokenRequestCount}`,
            expires_in: 3600,
            token_type: 'bearer',
          });
        }),
        http.post('https://api.igdb.com/v4/games', () => {
          gamesRequestCount++;
          // Só a primeira chamada é rejeitada, simulando um token revogado
          if (gamesRequestCount === 1) {
            return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
          }
          return HttpResponse.json([mockGame]);
        }),
      );

      const service = new IgdbService();
      const results = await service.searchGames('witcher');

      expect(results).toHaveLength(1);
      expect(tokenRequestCount).toBe(2); // buscou um token novo
      expect(gamesRequestCount).toBe(2); // e repetiu a chamada
    });

    it('should not retry more than once when the credentials are really invalid', async () => {
      let gamesRequestCount = 0;

      server.use(
        http.post('https://api.igdb.com/v4/games', () => {
          gamesRequestCount++;
          return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }),
      );

      const service = new IgdbService();
      await expect(service.searchGames('witcher')).rejects.toMatchObject({
        statusCode: 503,
      });
      expect(gamesRequestCount).toBe(2); // a original e uma única retentativa
    });

    it('should throw an AppError 503 when the request takes too long', async () => {
      server.use(
        http.post('https://api.igdb.com/v4/games', async () => {
          await delay(100);
          return HttpResponse.json([]);
        }),
      );

      // Timeout bem curto só para este teste, para não precisar esperar de
      // verdade o timeout padrão de produção.
      const service = new IgdbService(20);
      await expect(service.searchGames('witcher')).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });

  describe('getGameById', () => {
    it('should return a transformed complete game object when the API returns valid data', async () => {
      server.use(
        igdbGames([
          {
            ...mockGame,
            summary: 'An epic RPG.',
            release_dates: [{ date: 1431993600, platform: 6 }],
          },
        ]),
      );
      const service = new IgdbService();
      const game = await service.getGameById(1942);

      expect(game).toEqual({
        id: 1942,
        name: 'The Witcher 3: Wild Hunt',
        slug: 'the-witcher-3-wild-hunt',
        cover_image_id: 'co1wyy',
        first_release_date: '2015-05-19T00:00:00.000Z',
        platforms: [{ id: 6, name: 'PC (Microsoft Windows)', slug: 'win' }],
        summary: 'An epic RPG.',
        release_dates: [
          { platform_id: 6, date: '2015-05-19T00:00:00.000Z' },
        ],
      });
    });

    // A IGDB devolve uma entrada por plataforma E por região — o mesmo jogo
    // pode ter três datas para a mesma plataforma. O service devolve todas;
    // quem persiste é que decide qual usar.
    it('should map every release date entry, including multiple for the same platform', async () => {
      server.use(
        igdbGames([
          {
            ...mockGame,
            release_dates: [
              { date: 1431993600, platform: 6 }, // 2015-05-19
              { date: 1433203200, platform: 6 }, // 2015-06-02 (outra região)
              { date: 1447200000, platform: 48 }, // 2015-11-11, outra plataforma
            ],
          },
        ]),
      );

      const service = new IgdbService();
      const game = await service.getGameById(1942);

      expect(game?.release_dates).toEqual([
        { platform_id: 6, date: '2015-05-19T00:00:00.000Z' },
        { platform_id: 6, date: '2015-06-02T00:00:00.000Z' },
        { platform_id: 48, date: '2015-11-11T00:00:00.000Z' },
      ]);
    });

    // Lançamentos "TBD" ou com só o ano conhecido chegam sem `date`; sem data
    // ou sem plataforma não há como preencher game_platforms.release_date.
    it('should drop release date entries missing a date or a platform', async () => {
      server.use(
        igdbGames([
          {
            ...mockGame,
            release_dates: [
              { date: 1431993600, platform: 6 },
              { platform: 48 }, // data ainda não anunciada
              { date: 1447200000 }, // sem plataforma
            ],
          },
        ]),
      );

      const service = new IgdbService();
      const game = await service.getGameById(1942);

      expect(game?.release_dates).toEqual([
        { platform_id: 6, date: '2015-05-19T00:00:00.000Z' },
      ]);
    });

    it('should return an empty release date list when the game has none', async () => {
      server.use(igdbGames([mockGame]));

      const service = new IgdbService();
      const game = await service.getGameById(1942);

      expect(game?.release_dates).toEqual([]);
    });

    // `number` em TypeScript inclui NaN e frações — e `Number(req.params.id)`
    // de um controller produz NaN sem esforço nenhum.
    it.each([NaN, Infinity, 1.5])(
      'should reject %p as a game id without calling IGDB',
      async (invalidId) => {
        let igdbWasCalled = false;
        server.use(
          http.post('https://api.igdb.com/v4/games', () => {
            igdbWasCalled = true;
            return HttpResponse.json([]);
          }),
        );

        const service = new IgdbService();
        await expect(service.getGameById(invalidId)).rejects.toMatchObject({
          statusCode: 400,
        });
        expect(igdbWasCalled).toBe(false);
      },
    );

    it('should return null when the game is not found', async () => {
      const service = new IgdbService();
      const game = await service.getGameById(9999);
      expect(game).toBeNull();
    });

    it('should return null summary when it is missing in the API response', async () => {
      server.use(
        igdbGames([
          { id: 1, name: 'Game Without Summary', slug: 'game-without-summary' },
        ]),
      );

      const service = new IgdbService();
      const game = await service.getGameById(1);

      expect(game?.summary).toBeNull();
    });

    it('should return AppError 503 when IGDB returns an error', async () => {
      server.use(igdbGamesError({ message: 'Service Unavailable' }, 503));

      const service = new IgdbService();
      await expect(service.getGameById(1942)).rejects.toMatchObject({
        statusCode: 503,
      });
    });
  });
});
