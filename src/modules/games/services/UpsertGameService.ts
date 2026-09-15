import { Pool, PoolClient } from 'pg';
import { AppError } from '@shared/errors/AppError';
import { pool } from '@shared/infra/database';
import { withTransaction } from '@shared/infra/database/withTransaction';
import { getIgdbService } from '@shared/infra/igdb/IgdbService';
import { IgdbGame } from '@shared/infra/igdb/types';
import { Game } from '../types';

// Tanto o pool quanto um client de transação sabem executar query. Aceitar os
// dois permite reusar a mesma leitura dentro e fora da transação.
type Queryable = Pool | PoolClient;

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
 */
export class UpsertGameService {
  async execute(igdbId: number): Promise<Game> {
    // Cache-aside: se o jogo já está local, nem chegamos a falar com a IGDB.
    // Como a escrita acontece toda dentro de uma transação, a existência da
    // linha em `games` garante que plataformas e vínculos também estão lá.
    const cached = await this.findGame(pool, igdbId);
    if (cached) return cached;

    const igdbGame = await getIgdbService().getGameById(igdbId);

    if (!igdbGame) {
      throw new AppError(`Game ${igdbId} not found on IGDB`, 404);
    }

    return withTransaction(async (client) => {
      // A ordem importa: `game_platforms` tem FK para as outras duas tabelas,
      // então plataformas e jogo precisam existir antes do vínculo.
      await this.insertPlatforms(client, igdbGame.platforms);
      await this.insertGame(client, igdbGame);
      await this.insertGamePlatforms(client, igdbGame);

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

  private async insertGamePlatforms(
    client: PoolClient,
    game: IgdbGame,
  ): Promise<void> {
    if (game.platforms.length === 0) return;

    const releaseDates = this.earliestDateByPlatform(game);

    // A lista de plataformas é a fonte da verdade, não a de datas: uma entrada
    // de release_date pode apontar para uma plataforma que foi descartada por
    // não ter slug, e inserir esse vínculo violaria a FK.
    const rows = game.platforms.map((platform) => ({
      game_id: game.id,
      platform_id: platform.id,
      release_date: releaseDates.get(platform.id) ?? null,
    }));

    await client.query({
      text: `
        INSERT INTO game_platforms (game_id, platform_id, release_date)
        SELECT game_id, platform_id, release_date
          FROM json_to_recordset($1::json)
            AS link(game_id int, platform_id int, release_date timestamp)
        ON CONFLICT (game_id, platform_id) DO NOTHING;
      `,
      values: [JSON.stringify(rows)],
    });
  }

  /**
   * A IGDB devolve uma data por plataforma E por região, mas
   * `game_platforms.release_date` é uma coluna só. A regra escolhida é a data
   * mais antiga de cada plataforma: ela responde "quando esse jogo saiu nessa
   * plataforma" sem depender da região do usuário.
   *
   * A comparação entre strings funciona porque todas vêm de `toISOString()` —
   * mesmo formato, sempre em UTC, então a ordem lexicográfica coincide com a
   * ordem cronológica.
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
