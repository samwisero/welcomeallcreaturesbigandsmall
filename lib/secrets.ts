// lib/secrets.ts — config values for server routes.
// Tries process.env first; falls back to parsing /root/.zo_secrets directly
// (routes run server-side on the box). Never log values.
import { readFileSync } from "node:fs";

let fileCache: Record<string, string> | null = null;

function fromFile(name: string): string | undefined {
  if (fileCache === null) {
    fileCache = {};
    try {
      const raw = readFileSync("/root/.zo_secrets", "utf-8");
      for (let line of raw.split("\n")) {
        line = line.trim();
        if (line.startsWith("export ")) line = line.slice(7);
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const i = line.indexOf("=");
        const k = line.slice(0, i).trim();
        let v = line.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        fileCache[k] = v;
      }
    } catch {
      // file unreadable — env-only mode
    }
  }
  return fileCache[name];
}

export function secret(name: string, fallback?: string): string {
  const v = process.env[name] ?? fromFile(name) ?? fallback;
  if (v === undefined) throw new Error(`missing required secret: ${name}`);
  return v;
}
