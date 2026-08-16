import { app, dbMode } from '../src/app';
import { pgPool } from '../src/utils/database';

const connectDatabase = async () => {
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0);

  try {
    await pgPool.query('SELECT 1');
    dbMode.usePostgres = true;
    console.log('PostgreSQL connected successfully');
  } catch (error: any) {
    console.error('PostgreSQL connection failed:', error.message);
    throw error;
  }
};

let initialized: Promise<void> | null = null;

const handler = async (req: any, res: any) => {
  if (!initialized) {
    initialized = connectDatabase();
  }

  try {
    await initialized;
    return app(req, res);
  } catch (error) {
    console.error('Database initialization failed:', error);

    return res.status(503).json({
      status: 'error',
      message: 'Database connection failed'
    });
  }
};

export default handler;