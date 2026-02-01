import { Router } from 'express';
import { StatusController } from '../controllers/StatusController';

const statusRoutes = Router();
const statusController = new StatusController();

statusRoutes.get('/', statusController.handle);

export { statusRoutes };
