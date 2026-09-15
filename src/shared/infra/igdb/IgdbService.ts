import { AppError } from '@shared/errors/AppError';
import { z, ZodType } from 'zod';
import { IgdbGame, IgdbGameSearchResult } from './types';

const igdbRawPlatformSchema = z.object({
  id: z.number(),
  name: z.string(),
});

const igdbRawGameSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  cover: z
    .object({
      id: z.number(),
      image_id: z.string(),
    })
    .optional(),
  first_release_date: z.number().optional(),
  summary: z.string().optional(),
  platforms: z.array(igdbRawPlatformSchema).optional(),
});

const igdbRawGameArraySchema = z.array(igdbRawGameSchema);

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Tempo máximo de espera por uma resposta da Twitch/IGDB antes de desistir.
// Sem isso, uma API externa que trava (em vez de responder com erro) deixa
// a requisição pendurada indefinidamente.
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 50;

export class IgdbService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private tokenPromise: Promise<string> | null = null;

  constructor(requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS) {
    const requiredEnvVars = [
      'TWITCH_CLIENT_ID',
      'TWITCH_CLIENT_SECRET',
      'TWITCH_TOKEN_URL',
      'IGDB_BASE_URL',
    ];

    const missingEnvVars = requiredEnvVars.filter(
      (varName) => !process.env[varName],
    );

    if (missingEnvVars.length > 0) {
      throw new Error(
        `Twitch/IGDB environment variables missing: ${missingEnvVars.join(', ')}`,
      );
    }

    this.clientId = process.env.TWITCH_CLIENT_ID!;
    this.clientSecret = process.env.TWITCH_CLIENT_SECRET!;
    this.tokenUrl = process.env.TWITCH_TOKEN_URL!;
    this.baseUrl = process.env.IGDB_BASE_URL!;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  private mapRawToBase(
    raw: z.infer<typeof igdbRawGameSchema>,
  ): Omit<IgdbGame, 'summary'> {
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      cover_image_id: raw.cover?.image_id ?? null,
      first_release_date: raw.first_release_date
        ? new Date(raw.first_release_date * 1000).toISOString()
        : null,
      platforms: raw.platforms ?? [],
    };
  }

  // Escapa barras invertidas e aspas duplas antes de colocar um valor vindo de
  // fora dentro de uma string literal da query APIcalypse. Sem isso, um valor
  // como `foo"; fields *;` conseguiria "fechar" a string antes da hora e
  // injetar cláusulas extras na consulta enviada à IGDB.
  private escapeApicalypseString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private clampSearchLimit(limit: number): number {
    if (!Number.isFinite(limit)) return DEFAULT_SEARCH_LIMIT;
    return Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_LIMIT);
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    this.tokenPromise = this.fetchAccessToken();

    try {
      return await this.tokenPromise;
    } finally {
      this.tokenPromise = null;
    }
  }

  // Executa um fetch com timeout e converte qualquer falha de rede (DNS,
  // conexão recusada, timeout etc.) em um AppError 503. Sem isso, esses erros
  // vazariam crus do `fetch` e o errorHandler os trataria como 500 genérico,
  // em vez do 503 informativo que usamos para os outros erros da IGDB/Twitch.
  private async safeFetch(
    url: string,
    init: RequestInit,
    context: string,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new AppError(`Failed to reach ${context}: ${reason}`, 503);
    }
  }

  // Faz o mesmo que o `safeFetch` faz para a chamada de rede, mas para o
  // parse do corpo da resposta: se a Twitch/IGDB responder 200 com um corpo
  // que não é JSON válido (proxy fora do ar, página de erro em HTML etc.),
  // `response.json()` lançaria um SyntaxError cru em vez de um AppError 503.
  private async safeJson(response: Response, context: string): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new AppError(`Failed to parse response from ${context}`, 503);
    }
  }

  private async fetchAccessToken(): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'client_credentials',
    });

    const response = await this.safeFetch(
      `${this.tokenUrl}?${params}`,
      { method: 'POST' },
      'Twitch authentication endpoint',
    );

    if (!response.ok) {
      throw new AppError(
        `Failed to authenticate with IGDB: ${response.status} ${response.statusText}`,
        503,
      );
    }

    const data = (await this.safeJson(
      response,
      'Twitch authentication endpoint',
    )) as TwitchTokenResponse;

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000; // Token expira 1 minuto antes do real para evitar problemas de sincronização

    return this.accessToken;
  }

  private async request<T>(
    endpoint: string,
    query: string,
    schema: ZodType<T>,
  ): Promise<T> {
    const token = await this.getAccessToken();

    const response = await this.safeFetch(
      `${this.baseUrl}/${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Client-ID': this.clientId,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body: query,
      },
      `IGDB endpoint "${endpoint}"`,
    );

    if (!response.ok) {
      throw new AppError(
        `Failed to call IGDB endpoint "${endpoint}": ${response.status} ${response.statusText}`,
        503,
      );
    }

    const json = await this.safeJson(response, `IGDB endpoint "${endpoint}"`);
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      throw new AppError(
        `Unexpected response shape from IGDB endpoint "${endpoint}": ${parsed.error.message}`,
        503,
      );
    }

    return parsed.data;
  }

  async searchGames(
    query: string,
    limit: number = DEFAULT_SEARCH_LIMIT,
  ): Promise<IgdbGameSearchResult[]> {
    const safeQuery = this.escapeApicalypseString(query);
    const safeLimit = this.clampSearchLimit(limit);

    const igdbQuery = `fields id, name, slug, cover.image_id, platforms.id, platforms.name, first_release_date; search "${safeQuery}"; limit ${safeLimit};`;

    const rawGames = await this.request(
      'games',
      igdbQuery,
      igdbRawGameArraySchema,
    );

    return rawGames.map((raw) => this.mapRawToBase(raw));
  }

  async getGameById(id: number): Promise<IgdbGame | null> {
    const igdbQuery = `fields id, name, slug, cover.image_id, platforms.id, platforms.name, first_release_date, summary; where id = ${id}; limit 1;`;

    const results = await this.request(
      'games',
      igdbQuery,
      igdbRawGameArraySchema,
    );

    if (results.length === 0) return null;

    const raw = results[0];
    const base = this.mapRawToBase(raw);

    return {
      ...base,
      summary: raw.summary ?? null,
    };
  }
}

// Lazy singleton: a instância só é criada na primeira chamada real, não no
// momento em que este arquivo é importado. Isso evita que qualquer código
// que importe este módulo (mesmo sem usar o service) seja obrigado a ter as
// env vars da Twitch/IGDB configuradas só para não quebrar no import.
let instance: IgdbService | null = null;

export function getIgdbService(): IgdbService {
  if (!instance) {
    instance = new IgdbService();
  }
  return instance;
}
