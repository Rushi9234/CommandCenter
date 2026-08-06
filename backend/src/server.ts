import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import { pgPool } from './utils/database';
import { mockDbService } from './services/mockDatabaseService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Determine database mode
let usePostgres = false;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

// Health check
app.get('/health', async (req, res) => {
  try {
    if (usePostgres) {
      await pgPool.query('SELECT 1');
      res.json({ 
        status: 'ok', 
        message: 'CommandCenter API is running 🚀 (PostgreSQL Mode)' 
      });
    } else {
      await mockDbService.testConnection();
      res.json({ 
        status: 'ok', 
        message: 'CommandCenter API is running 🚀 (Mock Mode - Persistent)' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed' 
    });
  }
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const startServer = async () => {
  try {
    // Test PostgreSQL connection
    await pgPool.query('SELECT 1');
    console.log('✅ PostgreSQL connected successfully');
    usePostgres = true;
    
    app.listen(PORT, () => {
      console.log(`\n🚀 CommandCenter Backend running on port ${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}/api`);
      console.log(`💚 Health: http://localhost:${PORT}/health`);
      console.log(`\n⚡ Running in POSTGRESQL mode with persistent storage\n`);
    });
  } catch (error) {
    console.error('Failed to connect to PostgreSQL:', error.message);
    console.log('\n📝 Using Mock Database Service for testing (data persists during server runtime)\n');
    
    app.listen(PORT, () => {
      console.log(`\n🚀 CommandCenter Backend running on port ${PORT}`);
      console.log(`📡 API: http://localhost:${PORT}/api`);
      console.log(`💚 Health: http://localhost:${PORT}/health`);
      console.log(`\n⚡ Running in MOCK mode with persistent storage\n`);
    });
  }
};

startServer();
