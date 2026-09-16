import { Router } from 'express';
import { statusRoutes } from '../status.routes';
import { gamesRoutes } from '../games.routes';

const v1Router = Router();

v1Router.use('/status', statusRoutes);
v1Router.use('/games', gamesRoutes);

export { v1Router };
