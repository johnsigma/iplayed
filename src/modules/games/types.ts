// Representa uma linha da tabela `games` como ela volta do banco — por isso
// os nomes em snake_case. `first_release_date` é string ('YYYY-MM-DD'), não
// Date: o parser do driver é configurado para devolver colunas DATE como
// texto cru (ver src/shared/infra/database/index.ts), evitando a conversão
// para meia-noite no fuso local que reintroduziria ambiguidade de fuso.
// `created_at`/`updated_at` continuam Date — são TIMESTAMP, tipo diferente,
// não afetado por essa configuração (ver issue #51).
export interface Game {
  id_igdb: number;
  title: string;
  slug: string | null;
  cover_image_id: string | null;
  summary: string | null;
  first_release_date: string | null;
  created_at: Date;
  updated_at: Date | null;
}
