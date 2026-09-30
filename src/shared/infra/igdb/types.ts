export interface IgdbPlatform {
  id: number;
  name: string;
  slug: string;
}

export interface IgdbReleaseDate {
  platform_id: number;
  date: string;
}

// Valores de `game_type` na IGDB (tabela /game_types). Só os que o projeto
// consulta hoje — a tabela completa tem 15 tipos (DLC, Expansion, Remaster,
// Remake, Port, Mod...).
export const IGDB_GAME_TYPE = {
  MAIN_GAME: 0,
  BUNDLE: 3,
} as const;

export interface IgdbGame {
  id: number;
  name: string;
  slug: string;
  cover_image_id: string | null;
  first_release_date: string | null;
  summary: string | null;
  platforms: IgdbPlatform[];
  release_dates: IgdbReleaseDate[];
  // Quando a entrada é uma edição de outro jogo (colecionador, GOTY,
  // Complete...), o id do jogo de origem. `null` quando não é edição de nada.
  version_parent: number | null;
  // Categoria da entrada na IGDB (ver IGDB_GAME_TYPE). `null` quando a IGDB
  // não informa.
  game_type: number | null;
}

// A busca não precisa de `summary`, das datas por plataforma nem do vínculo
// de edição — esses campos só interessam na hora de persistir um jogo
// (getGameById).
export type IgdbGameSearchResult = Omit<
  IgdbGame,
  'summary' | 'release_dates' | 'version_parent' | 'game_type'
>;
