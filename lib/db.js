import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
