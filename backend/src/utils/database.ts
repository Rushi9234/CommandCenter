import { Pool } from 'pg';
import { createClient } from 'redis';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// PostgreSQL Connection
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Redis Connection
export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

export const connectRedis = async () => {
  await redisClient.connect();
  console.log('✅ Redis connected');
};

// MongoDB Connection
export const mongoClient = new MongoClient(process.env.MONGODB_URL || '');

export const connectMongo = async () => {
  await mongoClient.connect();
  console.log('✅ MongoDB connected');
};

export const getMongoDb = () => mongoClient.db('commandcenter');
