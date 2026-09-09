// lib/memory-mirror.ts — write a thread's messages into memory (mirror + embed), v1 (2026-09-09)
//
// The transcripts route mirrors 40 messages per save (eventually consistent —
// fine for live chat). Imports need ALL messages mirrored now, with progress,
// so the import job calls this directly. Same row shape as the live mirror,
// plus `speaker` (who said it, by name) and `imported` for provenance.
import { surrealQuery, str, thing } from "./surreal-client";
import { embedBatch } from "./embedding";

export interface MirrorMessage { id: string; text: string; type: "user" | "ai"; ts?: number; speaker?: string; imported?: boolean }

export async function mirrorMessages(
  uid: string,
  threadId: string,
  beingIdFull: string | null, // "being:<id>" or null
  messages: MirrorMessage[],
  onProgress?: (done: number, total: number) => Promise<void> | void,
): Promise<{ written: number; embedded: number }> {
  const batchSize = 20;
  let written = 0;
  let embedded = 0;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize).filter((m) => m.text.trim());
    if (batch.length === 0) continue;
    const vecs = await embedBatch(batch.map((m) => m.text));
    let sql = "";
    for (let j = 0; j < batch.length; j++) {
      const m = batch[j];
      const v = vecs[j];
      if (v) embedded++;
      sql += `UPSERT ${thing("memory", m.id)} SET
        user_id = ${str(uid)},
        thread_id = ${str(`thread:${threadId}`)},
        being_id = ${beingIdFull ? str(beingIdFull) : "NONE"},
        message_id = ${str(m.id)},
        role = ${str(m.type === "ai" ? "being" : "user")},
        kind = "chat_message",
        speaker = ${m.speaker ? str(m.speaker) : "NONE"},
        imported = ${m.imported ? "true" : "false"},
        content = ${str(m.text)},
        created_at = ${m.ts ? `d${str(new Date(m.ts).toISOString())}` : "time::now()"},
        embedding = ${v ? JSON.stringify(v) : "NONE"};\n`;
    }
    await surrealQuery(sql);
    written += batch.length;
    if (onProgress) await onProgress(Math.min(i + batchSize, messages.length), messages.length);
  }
  return { written, embedded };
}
