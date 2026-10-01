import { Router } from 'express';
import { HealthController } from '../controllers/HealthController';

const healthRoutes = Router();
const healthController = new HealthController();

healthRoutes.get('/live', healthController.live);
healthRoutes.get('/ready', healthController.ready);

export { healthRoutes };
