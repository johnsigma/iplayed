// Representa uma linha da tabela `games` como ela volta do banco — por isso
// os nomes em snake_case e os timestamps como Date (o driver pg já converte
// colunas TIMESTAMP para Date).
export interface Game {
  id_igdb: number;
  title: string;
  slug: string | null;
  cover_image_id: string | null;
  summary: string | null;
  first_release_date: Date | null;
  created_at: Date;
  updated_at: Date | null;
}
