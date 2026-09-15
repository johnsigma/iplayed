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

const mockIgdbGame = (payload: JsonBodyType) =>
  http.post('https://api.igdb.com/v4/games', () => {
    igdbCallCount++;
    return HttpResponse.json(payload);
  });

// As colunas TIMESTAMP são lidas pelo driver como Date em horário local, o
// que tornaria as asserções dependentes do fuso da máquina. Comparar a data
// formatada pelo próprio Postgres evita esse ruído.
async function releaseDateOf(platformId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT to_char(release_date, 'YYYY-MM-DD') AS date
       FROM game_platforms WHERE platform_id = $1;`,
    [platformId],
  );

  return result.rows[0]?.date ?? null;
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
  });

  it('should persist the game, its platforms and the links between them', async () => {
    server.use(mockIgdbGame([igdbGamePayload]));

    const game = await new UpsertGameService().execute(1942);

    expect(game.id_igdb).toBe(1942);
    expect(game.title).toBe('The Witcher 3: Wild Hunt');
    expect(game.slug).toBe('the-witcher-3-wild-hunt');
    expect(game.cover_image_id).toBe('co1wyy');
    expect(game.summary).toBe('An epic RPG.');

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
});
