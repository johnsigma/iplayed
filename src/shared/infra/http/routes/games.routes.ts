import { Router } from 'express';
import { GamesController } from '@modules/games/controllers/GamesController';

const gamesRoutes = Router();
const gamesController = new GamesController();

gamesRoutes.get('/search', gamesController.search);

export { gamesRoutes };
