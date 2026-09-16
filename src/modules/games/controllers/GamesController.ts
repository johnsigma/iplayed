import { Request, Response } from 'express';
import { getIgdbService } from '@shared/infra/igdb/IgdbService';
import { searchGamesQuerySchema } from '../schemas/searchGamesQuerySchema';

export class GamesController {
  // A validação lança ZodError quando `req.query` não bate com o schema.
  // Não é capturada aqui de propósito: `express-async-errors` (importado em
  // app.ts) encaminha qualquer erro de um handler async para o `errorHandler`,
  // que já sabe converter ZodError em 400 com o campo e a mensagem de cada
  // problema. Isso mantém o controller livre de try/catch repetitivo.
  async search(req: Request, res: Response): Promise<Response> {
    const { q, limit } = searchGamesQuerySchema.parse(req.query);

    const games = await getIgdbService().searchGames(q, limit);

    return res.status(200).json(games);
  }
}
