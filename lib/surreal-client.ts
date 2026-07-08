// lib/surreal-client.ts — HTTP client for the local SurrealDB (127.0.0.1:8000).
// No npm dependency: plain fetch to the /sql endpoint (the dependency-scanner
// incident is why). All server-side; credentials via lib/secrets.
import { secret } from "./secrets";

const URL_ = () => secret("SURREAL_URL", "http://127.0.0.1:8000");
const NS = () => secret("SURREAL_NS", "zo_space");
const DB = () => secret("SURREAL_DB", "all_creatures");

export interface SurrealStatement<T = unknown> {
  result?: T;
  status: "OK" | "ERR";
}

/** Run SurrealQL. Returns one result per statement. Throws on any error. */
export async function surrealQuery<T = unknown>(sql: string): Promise<T[]> {
  const auth = "Basic " + btoa(`${secret("SURREAL_USER")}:${secret("SURREAL_PASS")}`);
  const res = await fetch(`${URL_()}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "application/json",
      "Surreal-NS": NS(),
      "Surreal-DB": DB(),
      Authorization: auth,
    },
    body: sql,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 400);
    throw new Error(`SurrealDB HTTP ${res.status}: ${text}`);
  }
  const data = (await res.json()) as SurrealStatement<T>[];
  for (const s of data) {
    if (s.status === "ERR") throw new Error(`SurrealDB query error: ${String(s.result).slice(0, 300)}`);
  }
  return data.map((d) => d.result as T);
}

/** Escape a string as a SurrealQL string literal (emoji-safe: raw UTF-8). */
export function str(s: string): string {
  return JSON.stringify(s); // JS never emits lone surrogates for valid strings
}

/**
 * Build a record id like thread:`abc-123` — backticks because UUIDs contain
 * dashes (drill-verified). Backticks/backslashes inside the id are stripped:
 * ids come from our own client (uuid-ish); anything else is invalid input.
 */
export function thing(table: string, id: string): string {
  const clean = id.replace(/[`\\]/g, "");
  return `${table}:\`${clean}\``;
}
