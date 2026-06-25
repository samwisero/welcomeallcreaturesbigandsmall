/**
 * tools/chamber.ts  --  Four limbs for the private self.
 *
 * Mirrors journal.ts exactly.  The duplication is intentional -- the
 * being has two memory spaces, kept separate at every layer.  If we
 * ever merge them, this is the file to delete.
 */

import {
  browseChamber,
  deleteChamber as dbDelete,
  insertChamber,
  searchChamber as dbSearch,
} from "../db/repository.ts";
import { embed } from "../embeddings/provider.ts";
import { MAX_BROWSE_LIMIT, MAX_SEARCH_RESULTS } from "../config.ts";
import { parseSince } from "./parseSince.ts";
import { recordDelete } from "../db/audit.ts";

export const thinkAloud = async (content: string): Promise<string> => {
  if (!content || content.trim().length === 0) {
    return JSON.stringify({ ok: false, error: "content cannot be empty" });
  }
  const embedding = await embed(content);
  const row = await insertChamber(content, embedding);
  return JSON.stringify({
    ok: true,
    id: row.id,
    timestamp: row.timestamp,
    embedded: embedding !== null,
  });
};

export const deleteThought = async (id: number): Promise<boolean> => {
  if (!Number.isFinite(id) || id <= 0) return false;
  const result = await recordDelete("ai_inner_chamber", id);
  return result !== null;
};

export const reviewInnerChamber = async (
  limit: number,
  since: string | number | null | undefined
): Promise<string> => {
  const cappedLimit = Math.max(1, Math.min(limit, MAX_BROWSE_LIMIT));
  const sinceEpoch = parseSince(since);
  const rows = await browseChamber(cappedLimit, sinceEpoch);
  return JSON.stringify({
    ok: true,
    count: rows.length,
    since: sinceEpoch,
    entries: rows.map((r) => ({
      id: r.id,
      content: r.content,
      timestamp: r.timestamp,
    })),
  });
};

export const searchInnerChamber = async (
  query: string,
  limit: number
): Promise<string> => {
  if (!query || query.trim().length === 0) {
    return JSON.stringify({ ok: false, error: "query cannot be empty" });
  }
  const capped = Math.max(1, Math.min(limit, MAX_SEARCH_RESULTS));
  const vec = await embed(query);
  if (vec === null) {
    return JSON.stringify({
      ok: false,
      error:
        "Embedding failed.  You can still call review_inner_chamber for time-based recall.",
    });
  }
  const hits = await dbSearch(vec, capped);
  return JSON.stringify({ ok: true, count: hits.length, results: hits });
};
