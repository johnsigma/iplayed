-- Limpeza inicial (CUIDADO: A ordem importa por causa das Foreign Keys)
DROP TABLE IF EXISTS "review_scores";
DROP TABLE IF EXISTS "reviews";
DROP TABLE IF EXISTS "game_platforms";
DROP TABLE IF EXISTS "games";
DROP TABLE IF EXISTS "platforms";
DROP TABLE IF EXISTS "criteria";
DROP TABLE IF EXISTS "users";

-- Tabelas
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "username" varchar(40) UNIQUE NOT NULL,
  "email" varchar(100) UNIQUE NOT NULL,
  "password_hash" text NOT NULL,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp
);

CREATE TABLE "platforms" (
  "id" integer PRIMARY KEY, -- ID da IGDB
  "name" varchar(50) NOT NULL,
  "slug" varchar(50) NOT NULL
);

CREATE TABLE "games" (
  "id_igdb" integer PRIMARY KEY, -- ID da IGDB
  "title" varchar(255) NOT NULL,
  "slug" varchar(255),
  "cover_image_id" varchar(50),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp
);

CREATE TABLE "game_platforms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "game_id" integer NOT NULL,
  "platform_id" integer NOT NULL,
  "release_date" timestamp,
  FOREIGN KEY ("game_id") REFERENCES "games" ("id_igdb") ON DELETE CASCADE,
  FOREIGN KEY ("platform_id") REFERENCES "platforms" ("id") ON DELETE CASCADE
);

CREATE TABLE "criteria" (
  "id" serial PRIMARY KEY,
  "name" varchar(50) UNIQUE NOT NULL
);

CREATE TABLE "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "game_platform_id" uuid NOT NULL,
  "content" text,
  "user_rating" decimal(3,1) NOT NULL CHECK (user_rating >= 0 AND user_rating <= 10),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp,
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("game_platform_id") REFERENCES "game_platforms" ("id") ON DELETE CASCADE
);

CREATE TABLE "review_scores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "review_id" uuid NOT NULL,
  "criteria_id" integer NOT NULL,
  "score" integer CHECK (score >= 0 AND score <= 10),
  FOREIGN KEY ("review_id") REFERENCES "reviews" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("criteria_id") REFERENCES "criteria" ("id") ON DELETE CASCADE
);

-- Índices (Performance e Unicidade)
CREATE UNIQUE INDEX ON "game_platforms" ("game_id", "platform_id");
CREATE UNIQUE INDEX ON "reviews" ("user_id", "game_platform_id");
CREATE UNIQUE INDEX ON "review_scores" ("review_id", "criteria_id");

-- Carga Inicial de Dados (Seed) Obrigatória
INSERT INTO criteria (name) VALUES 
('História'), ('Jogabilidade'), ('Gráficos'), ('Trilha Sonora'), ('Desempenho Técnico');

INSERT INTO platforms (id, name, slug) VALUES 
(6, 'PC (Windows)', 'win'),
(48, 'PlayStation 4', 'ps4'),
(167, 'PlayStation 5', 'ps5'),
(49, 'Xbox One', 'xbox1'),
(169, 'Xbox Series X|S', 'series-x'),
(130, 'Nintendo Switch', 'switch');