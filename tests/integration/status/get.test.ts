import request from 'supertest';
import { app } from '@shared/infra/http/app';

test('GET to /api/v1/status should return 200', async () => {
  const response = await request(app).get('/api/v1/status');

  expect(response.status).toBe(200);

  const responseBody = response.body;
  const parsedUpdatedAt = new Date(responseBody.update_at).toISOString();
  expect(responseBody.update_at).toEqual(parsedUpdatedAt);

  expect(responseBody.dependencies.database.version).toEqual('16.0');

  expect(responseBody.dependencies.database.max_connections).toEqual(100);
});
