import { Pool, PoolClient } from 'pg';
import { AppError } from '@shared/errors/AppError';
import { pool } from '@shared/infra/database';
import { withTransaction } from '@shared/infra/database/withTransaction';
import { getIgdbService } from '@shared/infra/igdb/IgdbService';
import { IGDB_GAME_TYPE, IgdbGame } from '@shared/infra/igdb/types';
import { Game } from '../types';

// Tanto o pool quanto um client de transação sabem executar query. Aceitar os
// dois permite reusar a mesma leitura dentro e fora da transação.
type Queryable = Pool | PoolClient;

interface GamePlatformLink {
  game_id: number;
  platform_id: number;
  release_date: string | null;
}

// Tipos que uma edição de outro jogo pode ter, observados nos dados reais da
// IGDB: edições de colecionador/"Ultimate" vêm como Main Game; GOTY e
// Complete Edition (as que trazem todas as DLCs) vêm como Bundle. Qualquer
// outra combinação com `version_parent` — um Remaster ou uma DLC marcados
// como edição, por exemplo — seria dado contraditório, e na dúvida não
// mesclamos (ver issue #55).
const EDITION_GAME_TYPES: ReadonlySet<number> = new Set([
  IGDB_GAME_TYPE.MAIN_GAME,
  IGDB_GAME_TYPE.BUNDLE,
]);

// Quantas vezes seguimos `version_parent` até chegar num jogo que não seja
// edição. Nenhuma cadeia com mais de um salto apareceu nos dados levantados
// para a issue #55 — o limite existe para que um ciclo (A edição de B, B
// edição de A) termine em erro em vez de rodar para sempre.
const MAX_EDITION_REDIRECTS = 3;

const GAME_COLUMNS = `
  id_igdb,
  title,
  slug,
  cover_image_id,
  summary,
  first_release_date,
  created_at,
  updated_at
`;

/**
 * Garante que um jogo da IGDB exista no banco local (padrão cache-aside).
 *
 * A operação é idempotente: chamar duas vezes com o mesmo id não duplica
 * nada nem lança erro. Isso importa porque o upsert é disparado por ação de
 * usuário (criar review, escolher um jogo da busca), e ações de usuário se
 * repetem — duplo clique, retry após falha de rede, dois usuários avaliando
 * o mesmo jogo ao mesmo tempo.
 *
 * Edições de um mesmo jogo (colecionador, GOTY, Complete...) nunca são
 * gravadas: no lugar delas grava-se o jogo de origem, para que as reviews de
 * um mesmo jogo não fiquem espalhadas entre as edições (issue #55). Por isso
 * **o jogo devolvido pode ter `id_igdb` diferente do id pedido** — quem chama
 * deve usar o id devolvido dali em diante.
 */
export class UpsertGameService {
  async execute(igdbId: number): Promise<Game> {
    // Cache-aside: se o jogo já está local, nem chegamos a falar com a IGDB.
    // Como a escrita acontece toda dentro de uma transação, a existência da
    // linha em `games` garante que plataformas e vínculos também estão lá.
    const cached = await this.findGame(pool, igdbId);
    if (cached) return cached;

    const requested = await getIgdbService().getGameById(igdbId);

    if (!requested) {
      throw new AppError(`Game ${igdbId} not found on IGDB`, 404);
    }

    return this.persistCanonical(requested);
  }

  /**
   * Grava o jogo de origem de `game` — ou o próprio `game`, se ele não for
   * edição de nenhum outro. Se o de origem também for edição, segue a cadeia.
   *
   * Nunca grava nada a partir de dado inconsistente da IGDB (referência para
   * um jogo que não existe, ou cadeia que não termina): nesses casos lança
   * 503 sem persistir. Gravar é uma decisão permanente — a checagem de cache
   * no início de `execute` devolveria o id gravado errado para sempre, sem
   * nunca mais reavaliar. Falhar deixa a próxima tentativa decidir de novo,
   * quando a IGDB talvez já esteja consistente.
   */
  private async persistCanonical(
    game: IgdbGame,
    redirects = 0,
  ): Promise<Game> {
    const canonicalId = this.canonicalIdOf(game);

    if (canonicalId === game.id) {
      return this.persist(game);
    }

    if (redirects === MAX_EDITION_REDIRECTS) {
      throw new AppError(
        `Game ${game.id} is still an edition after ${MAX_EDITION_REDIRECTS} redirects on IGDB (cycle or chain too long)`,
        503,
      );
    }

    // Edições nunca são gravadas, então a checagem de cache no início de
    // `execute` sempre falha para elas; aqui é a chance real de evitar mais
    // uma chamada à IGDB.
    const cachedCanonical = await this.findGame(pool, canonicalId);
    if (cachedCanonical) return cachedCanonical;

    const canonical = await getIgdbService().getGameById(canonicalId);

    if (!canonical) {
      throw new AppError(
        `Game ${game.id} is an edition of game ${canonicalId}, which was not found on IGDB`,
        503,
      );
    }

    return this.persistCanonical(canonical, redirects + 1);
  }

  /**
   * Id do jogo de origem, se `game` for uma edição; o próprio id caso
   * contrário. `game_type` desempata quando o sinal é contraditório: um
   * Remaster com `version_parent` continua sendo Remaster (ver
   * EDITION_GAME_TYPES).
   */
  private canonicalIdOf(game: IgdbGame): number {
    if (
      game.version_parent !== null &&
      game.game_type !== null &&
      EDITION_GAME_TYPES.has(game.game_type)
    ) {
      return game.version_parent;
    }

    return game.id;
  }

  private persist(igdbGame: IgdbGame): Promise<Game> {
    return withTransaction(async (client) => {
      // A ordem importa: `game_platforms` tem FK para as outras duas tabelas,
      // então plataformas e jogo precisam existir antes do vínculo.
      await this.insertPlatforms(client, igdbGame.platforms);
      await this.insertGame(client, igdbGame);
      await this.insertGamePlatforms(
        client,
        this.buildGamePlatformLinks(igdbGame),
      );

      const persisted = await this.findGame(client, igdbGame.id);

      if (!persisted) {
        throw new AppError(`Game ${igdbGame.id} could not be persisted`, 500);
      }

      return persisted;
    });
  }

  private async findGame(
    executor: Queryable,
    igdbId: number,
  ): Promise<Game | null> {
    const result = await executor.query<Game>({
      text: `SELECT ${GAME_COLUMNS} FROM games WHERE id_igdb = $1;`,
      values: [igdbId],
    });

    return result.rows[0] ?? null;
  }

  // Duas requisições simultâneas para o mesmo jogo podem chegar aqui juntas;
  // o ON CONFLICT DO NOTHING faz a segunda virar no-op em vez de erro de
  // chave duplicada. O mesmo vale para os dois inserts seguintes.
  private async insertPlatforms(
    client: PoolClient,
    platforms: IgdbGame['platforms'],
  ): Promise<void> {
    if (platforms.length === 0) return;

    const rows = platforms.map((platform) => ({
      id_igdb: platform.id,
      name: platform.name,
      slug: platform.slug,
    }));

    await client.query({
      text: `
        INSERT INTO platforms (id_igdb, name, slug)
        SELECT id_igdb, name, slug
          FROM json_to_recordset($1::json)
            AS platform(id_igdb int, name varchar, slug varchar)
        ON CONFLICT (id_igdb) DO NOTHING;
      `,
      values: [JSON.stringify(rows)],
    });
  }

  private async insertGame(client: PoolClient, game: IgdbGame): Promise<void> {
    await client.query({
      text: `
        INSERT INTO games (
          id_igdb, title, slug, cover_image_id, summary, first_release_date
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id_igdb) DO NOTHING;
      `,
      values: [
        game.id,
        game.name,
        game.slug,
        game.cover_image_id,
        game.summary,
        game.first_release_date,
      ],
    });
  }

  // Grava exatamente as linhas que recebe — nenhuma decisão sobre qual data
  // usar acontece aqui, isso já foi resolvido por `buildGamePlatformLinks`.
  private async insertGamePlatforms(
    client: PoolClient,
    links: GamePlatformLink[],
  ): Promise<void> {
    if (links.length === 0) return;

    await client.query({
      text: `
        INSERT INTO game_platforms (game_id, platform_id, release_date)
        SELECT game_id, platform_id, release_date
          FROM json_to_recordset($1::json)
            AS link(game_id int, platform_id int, release_date date)
        ON CONFLICT (game_id, platform_id) DO NOTHING;
      `,
      values: [JSON.stringify(links)],
    });
  }

  /**
   * Decide o que gravar em `game_platforms`, separado de como gravar.
   *
   * A lista de plataformas é a fonte da verdade, não a de datas: uma entrada
   * de release_date pode apontar para uma plataforma que foi descartada por
   * não ter slug, e inserir esse vínculo violaria a FK.
   */
  private buildGamePlatformLinks(game: IgdbGame): GamePlatformLink[] {
    const releaseDates = this.earliestDateByPlatform(game);

    return game.platforms.map((platform) => ({
      game_id: game.id,
      platform_id: platform.id,
      release_date: releaseDates.get(platform.id) ?? null,
    }));
  }

  /**
   * A IGDB devolve uma data por plataforma E por região, mas
   * `game_platforms.release_date` é uma coluna só. A regra escolhida é a data
   * mais antiga de cada plataforma: ela responde "quando esse jogo saiu nessa
   * plataforma" sem depender da região do usuário.
   *
   * A comparação entre strings funciona porque todas vêm de
   * `IgdbService.toCalendarDate` — mesmo formato ('YYYY-MM-DD'), largura
   * fixa, então a ordem lexicográfica coincide com a ordem cronológica.
   */
  private earliestDateByPlatform(game: IgdbGame): Map<number, string> {
    const earliest = new Map<number, string>();

    for (const entry of game.release_dates) {
      const current = earliest.get(entry.platform_id);

      if (!current || entry.date < current) {
        earliest.set(entry.platform_id, entry.date);
      }
    }

    return earliest;
  }
}
