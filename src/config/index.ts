import { config as dotenvConfig } from 'dotenv';

// Carga variables desde .env (si existe)
dotenvConfig();

type Env = 'development' | 'production';

function required(key: string, val?: string): string {
  if (!val) throw new Error(`Environment variable ${key} is required`);
  return val;
}

const NODE_ENV = (process.env.NODE_ENV as Env) || 'development';
const DEV_PORT = Number(process.env.DEV_PORT || 3000);
const PROD_PORT = Number(process.env.PROD_PORT || 443);
const MONGO_URI = required('MONGO_URI', process.env.MONGO_URI);
const SECRET_SERVER = required('SECRET_SERVER', process.env.SECRET_SERVER);
const REDIS_URL = process.env.REDIS_URL || '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export interface Config {
  NODE_ENV: Env;
  PORT: number;
  MONGO_URI: string;
  SECRET_SERVER: string;
  REDIS_URL?: string;
  CORS_ORIGINS: string[];
  COOKIE_SECURE: boolean;
}

const config: Config = {
  NODE_ENV,
  PORT: NODE_ENV === 'development' ? DEV_PORT : PROD_PORT,
  MONGO_URI,
  SECRET_SERVER,
  REDIS_URL: REDIS_URL || undefined,
  CORS_ORIGINS,
  COOKIE_SECURE: NODE_ENV === 'production',
};

export default config;

// Uso:
// import config from './config';
// console.log(config.PORT, config.MONGO_URI);
