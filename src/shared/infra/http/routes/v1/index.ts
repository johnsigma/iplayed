import { Router } from 'express';
import { statusRoutes } from '../status.routes';

const v1Router = Router();

v1Router.use('/status', statusRoutes);

export { v1Router };
