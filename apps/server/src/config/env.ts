import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

export interface RuntimeConfig {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  jwtSecret: string;
}

export function initRuntimeConfig(): RuntimeConfig {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const envFile = resolve(process.cwd(), `.env.${nodeEnv}`);

  loadDotenv({ path: envFile });
  loadDotenv();

  const isProd = nodeEnv === 'production';
  const mongodbUri = process.env['MONGODB_URI'] ?? (isProd ? '' : 'mongodb://localhost:27017/filler_dev');
  const jwtSecret = process.env['JWT_SECRET'] ?? (isProd ? '' : 'dev-secret-change-me');

  if (!mongodbUri) {
    throw new Error('MONGODB_URI is required in production');
  }

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required in production');
  }

  const port = Number(process.env['PORT'] ?? 8080);

  process.env['NODE_ENV'] = nodeEnv;
  process.env['MONGODB_URI'] = mongodbUri;
  process.env['JWT_SECRET'] = jwtSecret;
  process.env['PORT'] = String(port);

  return {
    nodeEnv,
    port,
    mongodbUri,
    jwtSecret
  };
}
