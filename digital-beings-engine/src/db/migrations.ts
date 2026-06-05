/**
 * migrations.ts -- schema is managed EXTERNALLY (schema.sql, run via the
 * Supabase Management API). We do NOT create tables here: the multi-tenant
 * schema + policies already exist, and CREATE POLICY is not idempotent. Boot
 * just verifies the required tables are present and fails loud if not.
 */
import { getPool } from "./client.ts";

const REQUIRED = ["beings", "conversations", "ai_journal", "ai_inner_chamber", "ai_audit_log"] as const;

export const runMigrations = async (): Promise<void> => {
  const { rows } = await getPool().query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema='public' and table_name = any($1)",
    [REQUIRED as unknown as string[]]
  );
  const present = new Set(rows.map((r) => r.table_name));
  const missing = REQUIRED.filter((t) => !present.has(t));
  if (missing.length > 0) {
    throw new Error(`Missing required tables: ${missing.join(", ")}. Run schema.sql first.`);
  }
  console.log("[migrate] schema managed externally; all required tables present");
};

export const logTableCounts = async (): Promise<void> => {
  const pool = getPool();
  for (const table of ["beings", "ai_journal", "ai_inner_chamber", "ai_audit_log"] as const) {
    const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    console.log(`[migrate] ${table}: ${rows[0]?.count ?? "?"} rows`);
  }
};
