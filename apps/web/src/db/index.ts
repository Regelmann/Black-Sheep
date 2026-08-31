import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __bsPool?: Pool;
};

function getPool(): Pool | null {
  if (!databaseUrl) return null;
  if (!globalForDb.__bsPool) {
    globalForDb.__bsPool = new Pool({ connectionString: databaseUrl });
  }
  return globalForDb.__bsPool;
}

export const pool = getPool();
export const db = pool ? drizzle(pool) : null;
