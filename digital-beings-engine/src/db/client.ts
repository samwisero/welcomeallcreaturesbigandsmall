/**
 * client.ts -- Postgres pool (Supabase via Supavisor session pooler) with
 * pgvector registered. Discrete connection fields + SSL. Fail loud if pgvector
 * is missing.
 */
import "pgvector";
import { Pool, type PoolClient } from "pg";
import { DB_HOST, DB_PORT, DB_USER, DB_NAME, DB_PASSWORD } from "../config.ts";

let _pool: Pool | null = null;

const buildPool = (): Pool =>
  new Pool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

export const getPool = (): Pool => {
  if (_pool === null) _pool = buildPool();
  return _pool;
};

export const closePool = async (): Promise<void> => {
  if (_pool !== null) {
    await _pool.end();
    _pool = null;
  }
};

export const withClient = async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};

/** Verify pgvector is installed (it's created out-of-band via schema.sql). */
export const verifyPgvector = async (): Promise<void> => {
  await withClient(async (client) => {
    const { rows } = await client.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'"
    );
    if (rows.length === 0) {
      throw new Error("pgvector extension is not installed. Run schema.sql / CREATE EXTENSION vector.");
    }
  });
};
