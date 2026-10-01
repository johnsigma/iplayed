import { Router } from 'express';
import { healthRoutes } from './health.routes';
import { v1Router } from './v1';

const routes = Router();

// Fora de /api/v1 de propósito: quem consome as sondas de saúde é a
// infraestrutura (orquestrador, load balancer, CI), não um cliente da API —
// elas não acompanham o versionamento da API.
routes.use('/health', healthRoutes);
routes.use('/api/v1', v1Router);

export { routes };
