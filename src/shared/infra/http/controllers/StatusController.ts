import { Request, Response } from 'express';
import { pool } from '../../database';

export class StatusController {
  async handle(req: Request, res: Response) {
    try {
      const updatedAt = new Date().toISOString();

      const dabaseVersionResult = await pool.query('SHOW server_version;');
      const databaseVersionValue =
        dabaseVersionResult.rows[0]['server_version'];

      const databaseMaxConnectionsResult = await pool.query(
        'SHOW max_connections;',
      );
      const databaseMaxConnectionsValue =
        databaseMaxConnectionsResult.rows[0]['max_connections'];

      const databaseName = process.env.POSTGRES_DB;

      const databaseOpenedConnectionsResult = await pool.query({
        text: 'SELECT count(*)::int FROM pg_stat_activity WHERE datname=$1;',
        values: [databaseName],
      });
      const databaseOpenedConnectionsValue =
        databaseOpenedConnectionsResult.rows[0]['count'];

      return res.status(200).json({
        update_at: updatedAt,
        dependencies: {
          database: {
            version: databaseVersionValue,
            max_connections: parseInt(databaseMaxConnectionsValue),
            opened_connections: databaseOpenedConnectionsValue,
          },
        },
      });
    } catch (error) {
      console.error('Error checking database connection:', error);
      return res
        .status(500)
        .json({ status: 'error', message: 'Database connection failed' });
    }
  }
}
