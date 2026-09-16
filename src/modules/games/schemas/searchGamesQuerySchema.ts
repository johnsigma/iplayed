import { z } from 'zod';

// Regras de `q` são exatamente as da issue #44. `limit` é opcional e não
// estava no contrato original — decidimos expor porque o IgdbService já
// aceita e faz o clamp de segurança (1–50) internamente. Validar aqui não é
// redundante com esse clamp: sem isso, um `limit=abc` ou `limit=-5` chegaria
// ao service, seria silenciosamente ajustado para um valor "razoável" e o
// chamador nunca saberia que mandou algo inválido — com a validação, ele
// recebe um 400 claro na hora.
export const searchGamesQuerySchema = z.object({
  q: z.string().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type SearchGamesQuery = z.infer<typeof searchGamesQuerySchema>;
