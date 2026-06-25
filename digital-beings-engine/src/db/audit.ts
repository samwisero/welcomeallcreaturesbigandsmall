/**
 * audit.ts -- audit log for memory deletions (multi-tenant). The being can
 * delete its own memories; we copy the content into ai_audit_log right before
 * the DELETE, in one transaction, scoped to the being. Audit row outlives the
 * memory.
 */
import { withClient } from "./client.ts";
import { getCtx } from "../context.ts";

export type AuditSource = "ai_journal" | "ai_inner_chamber";

export const recordDelete = async (
  source: AuditSource,
  sourceId: number
): Promise<{ id: number; content: string; deletedAt: number } | null> => {
  const { userId, beingId } = getCtx();
  return await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const sel = await client.query<{ content: unknown }>(
        `SELECT content FROM ${source} WHERE id = $1 AND user_id = $2 AND being_id = $3 FOR UPDATE`,
        [sourceId, userId, beingId]
      );
      if (sel.rowCount === 0) {
        await client.query("ROLLBACK");
        return null;
      }
      const content = String(sel.rows[0]?.content);
      await client.query(`DELETE FROM ${source} WHERE id = $1 AND user_id = $2 AND being_id = $3`, [
        sourceId,
        userId,
        beingId,
      ]);
      const deletedAt = Math.floor(Date.now() / 1000);
      const ins = await client.query<{ id: unknown }>(
        `INSERT INTO ai_audit_log (user_id, being_id, source_table, source_id, content, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, beingId, source, sourceId, content, deletedAt]
      );
      await client.query("COMMIT");
      return { id: Number(ins.rows[0]?.id), content, deletedAt };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
};
