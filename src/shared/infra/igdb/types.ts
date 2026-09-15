export interface IgdbPlatform {
  id: number;
  name: string;
}

export interface IgdbGame {
  id: number;
  name: string;
  slug: string;
  cover_image_id: string | null;
  first_release_date: string | null;
  summary: string | null;
  platforms: IgdbPlatform[];
}

export type IgdbGameSearchResult = Omit<IgdbGame, 'summary'>;
