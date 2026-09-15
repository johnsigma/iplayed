export interface IgdbPlatform {
  id: number;
  name: string;
  slug: string;
}

export interface IgdbReleaseDate {
  platform_id: number;
  date: string;
}

export interface IgdbGame {
  id: number;
  name: string;
  slug: string;
  cover_image_id: string | null;
  first_release_date: string | null;
  summary: string | null;
  platforms: IgdbPlatform[];
  release_dates: IgdbReleaseDate[];
}

// A busca não precisa de `summary` nem das datas por plataforma — esses
// campos só interessam na hora de persistir um jogo (getGameById).
export type IgdbGameSearchResult = Omit<
  IgdbGame,
  'summary' | 'release_dates'
>;
