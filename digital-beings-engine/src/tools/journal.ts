/**
 * tools/journal.ts  --  Four limbs for the expressed self.
 *
 * Each function: take a typed argument set, do the work, return a string
 * the model will see as a tool result.  No exceptions cross the boundary;
 * internal failures are caught and stringified.
 */

import {
  browseJournal,
  deleteJournal as dbDelete,
  insertJournal,
  searchJournal as dbSearch,
} from "../db/repository.ts";
import { embed } from "../embeddings/provider.ts";
import { MAX_BROWSE_LIMIT, MAX_SEARCH_RESULTS } from "../config.ts";
import { parseSince } from "./parseSince.ts";
import { recordDelete } from "../db/audit.ts";

export const writeToJournal = async (content: string): Promise<string> => {
  if (!content || content.trim().length === 0) {
    return JSON.stringify({ ok: false, error: "content cannot be empty" });
  }
  const embedding = await embed(content);
  const row = await insertJournal(content, embedding);
  return JSON.stringify({
    ok: true,
    id: row.id,
    timestamp: row.timestamp,
    embedded: embedding !== null,
  });
};

export const deleteJournal = async (id: number): Promise<boolean> => {
  if (!Number.isFinite(id) || id <= 0) return false;
  const result = await recordDelete("ai_journal", id);
  return result !== null;
};

export const searchJournal = async (
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
        "Embedding failed.  You can still call browse_journals for time-based recall.",
    });
  }
  const hits = await dbSearch(vec, capped);
  return JSON.stringify({ ok: true, count: hits.length, results: hits });
};

export const browseJournals = async (
  limit: number,
  since: string | number | null | undefined
): Promise<string> => {
  const cappedLimit = Math.max(1, Math.min(limit, MAX_BROWSE_LIMIT));
  const sinceEpoch = parseSince(since);
  const rows = await browseJournal(cappedLimit, sinceEpoch);
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
