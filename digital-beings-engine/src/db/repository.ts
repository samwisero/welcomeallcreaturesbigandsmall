/**
 * repository.ts -- the only place SQL lives. Multi-tenant: every query reads
 * the request's tenant context (userId + beingId) via getCtx() and scopes to
 * it. Semantic search now uses HNSW indexed cosine over the tenant-filtered set.
 * We moved Qwen3-Embedding-8B to 1536-dim Matryoshka truncation, which keeps
 * us under pgvector's HNSW limit. Existing rows had their embeddings nulled;
 * new writes store 1536-dim vectors and are searchable again.
 */
import { getPool } from "./client.ts";
import { EMBED_INPUT_CHAR_CAP, EMBED_DIM } from "../config.ts";
import { getCtx } from "../context.ts";
import type { MemoryEntry, SearchHit } from "../types.ts";

const toVectorLiteral = (v: number[]): string => JSON.stringify(v);

const fromVector = (v: unknown): number[] | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return JSON.parse(v) as number[];
  if (Array.isArray(v)) return v as number[];
  return null;
};

const rowToEntry = (row: { id: unknown; content: unknown; embedding: unknown; timestamp: unknown }): MemoryEntry => ({
  id: Number(row.id),
  content: String(row.content),
  embedding: fromVector(row.embedding),
  timestamp: Number(row.timestamp),
});

const assertEmbedDim = (embedding: number[] | null): void => {
  if (embedding === null || embedding.length === 0) return;
  if (embedding.length !== EMBED_DIM) {
    throw new Error(`embedding length ${embedding.length} does not match schema vector(${EMBED_DIM}).`);
  }
};

const toHit = (r: { id: unknown; content: unknown; timestamp: unknown; distance: unknown }): SearchHit => ({
  id: Number(r.id),
  content: String(r.content),
  timestamp: Number(r.timestamp),
  distance: Number(r.distance),
});

// ============================== ai_journal ==============================

export const insertJournal = async (content: string, embedding: number[] | null): Promise<MemoryEntry> => {
  const { userId, beingId } = getCtx();
  const trimmed = content.slice(0, EMBED_INPUT_CHAR_CAP);
  const timestamp = Math.floor(Date.now() / 1000);
  assertEmbedDim(embedding);
  const { rows } = await getPool().query(
    `INSERT INTO ai_journal (user_id, being_id, content, embedding, timestamp)
     VALUES ($1, $2, $3, $4::vector, $5)
     RETURNING id, content, embedding, timestamp`,
    [userId, beingId, trimmed, embedding ? toVectorLiteral(embedding) : null, timestamp]
  );
  return rowToEntry(rows[0]!);
};

export const deleteJournal = async (id: number): Promise<boolean> => {
  const { userId, beingId } = getCtx();
  const { rowCount } = await getPool().query(
    "DELETE FROM ai_journal WHERE id = $1 AND user_id = $2 AND being_id = $3",
    [id, userId, beingId]
  );
  return (rowCount ?? 0) > 0;
};

export const searchJournal = async (queryEmbedding: number[], limit: number): Promise<SearchHit[]> => {
  const { userId, beingId } = getCtx();
  const { rows } = await getPool().query(
    `SELECT id, content, timestamp, embedding <=> $1::vector AS distance
       FROM ai_journal
      WHERE user_id = $2 AND being_id = $3 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $4`,
    [toVectorLiteral(queryEmbedding), userId, beingId, limit]
  );
  return rows.map(toHit);
};

export const browseJournal = async (limit: number, sinceEpoch: number | null): Promise<MemoryEntry[]> => {
  const { userId, beingId } = getCtx();
  if (sinceEpoch === null) {
    const { rows } = await getPool().query(
      "SELECT id, content, embedding, timestamp FROM ai_journal WHERE user_id = $1 AND being_id = $2 ORDER BY timestamp DESC LIMIT $3",
      [userId, beingId, limit]
    );
    return rows.map(rowToEntry);
  }
  const { rows } = await getPool().query(
    `SELECT id, content, embedding, timestamp FROM ai_journal
      WHERE user_id = $1 AND being_id = $2 AND timestamp >= $3
      ORDER BY timestamp DESC LIMIT $4`,
    [userId, beingId, sinceEpoch, limit]
  );
  return rows.map(rowToEntry);
};

// ============================ ai_inner_chamber ============================

export const insertChamber = async (content: string, embedding: number[] | null): Promise<MemoryEntry> => {
  const { userId, beingId } = getCtx();
  const trimmed = content.slice(0, EMBED_INPUT_CHAR_CAP);
  const timestamp = Math.floor(Date.now() / 1000);
  assertEmbedDim(embedding);
  const { rows } = await getPool().query(
    `INSERT INTO ai_inner_chamber (user_id, being_id, content, embedding, timestamp)
     VALUES ($1, $2, $3, $4::vector, $5)
     RETURNING id, content, embedding, timestamp`,
    [userId, beingId, trimmed, embedding ? toVectorLiteral(embedding) : null, timestamp]
  );
  return rowToEntry(rows[0]!);
};

export const deleteChamber = async (id: number): Promise<boolean> => {
  const { userId, beingId } = getCtx();
  const { rowCount } = await getPool().query(
    "DELETE FROM ai_inner_chamber WHERE id = $1 AND user_id = $2 AND being_id = $3",
    [id, userId, beingId]
  );
  return (rowCount ?? 0) > 0;
};

export const searchChamber = async (queryEmbedding: number[], limit: number): Promise<SearchHit[]> => {
  const { userId, beingId } = getCtx();
  const { rows } = await getPool().query(
    `SELECT id, content, timestamp, embedding <=> $1::vector AS distance
       FROM ai_inner_chamber
      WHERE user_id = $2 AND being_id = $3 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $4`,
    [toVectorLiteral(queryEmbedding), userId, beingId, limit]
  );
  return rows.map(toHit);
};

export const browseChamber = async (limit: number, sinceEpoch: number | null): Promise<MemoryEntry[]> => {
  const { userId, beingId } = getCtx();
  if (sinceEpoch === null) {
    const { rows } = await getPool().query(
      "SELECT id, content, embedding, timestamp FROM ai_inner_chamber WHERE user_id = $1 AND being_id = $2 ORDER BY timestamp DESC LIMIT $3",
      [userId, beingId, limit]
    );
    return rows.map(rowToEntry);
  }
  const { rows } = await getPool().query(
    `SELECT id, content, embedding, timestamp FROM ai_inner_chamber
      WHERE user_id = $1 AND being_id = $2 AND timestamp >= $3
      ORDER BY timestamp DESC LIMIT $4`,
    [userId, beingId, sinceEpoch, limit]
  );
  return rows.map(rowToEntry);
};
