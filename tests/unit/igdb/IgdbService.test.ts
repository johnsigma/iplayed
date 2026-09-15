import { delay, http, HttpResponse, JsonBodyType } from 'msw';
import { IgdbService } from '@shared/infra/igdb/IgdbService';
import { server } from '@tests/helpers/msw/server';

const mockGame = {
  id: 1942,
  name: 'The Witcher 3: Wild Hunt',
  slug: 'the-witcher-3-wild-hunt',
  cover: { id: 10, image_id: 'co1wyy' },
  first_release_date: 1431993600,
  platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
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
        platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
      });
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
      server.use(igdbGames([{ ...mockGame, summary: 'An epic RPG.' }]));
      const service = new IgdbService();
      const game = await service.getGameById(1942);

      expect(game).toEqual({
        id: 1942,
        name: 'The Witcher 3: Wild Hunt',
        slug: 'the-witcher-3-wild-hunt',
        cover_image_id: 'co1wyy',
        first_release_date: '2015-05-19T00:00:00.000Z',
        platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
        summary: 'An epic RPG.',
      });
    });

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
