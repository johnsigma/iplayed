import { Router } from 'express';
import { gamesRoutes } from '../games.routes';

const v1Router = Router();

v1Router.use('/games', gamesRoutes);

export { v1Router };
