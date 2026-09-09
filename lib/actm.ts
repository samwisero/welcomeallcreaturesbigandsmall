// lib/actm.ts — ACTM: All Creatures Transcript Markdown (v1, 2026-09-09)
//
// The ONE shape every imported document is normalized to before it becomes
// messages. Deterministic parsers produce it directly; the converter model
// (DeepSeek) produces it for messy text — under a strict VERBATIM rule: it may
// reshape structure, never words.
//
//   ---
//   title: <title>
//   source: <chatgpt-json | role-array | actm | name-lines | plain | model>
//   ---
//   ### <Speaker> — <MM/DD/YY h:mm AM/PM>     (the time part is optional)
//   <verbatim text, may span many lines>
//   ### <Speaker>
//   ...
//
// A plain document with no turns is a single section whose speaker is chosen
// by the friend at import time.

export interface ActmTurn { speaker: string; text: string; ts?: number }
export interface ActmDoc { title: string; source: string; turns: ActmTurn[] }

/** System prompt for the converter model. Verbatim is the whole point. */
export const ACTM_CONVERTER_PROMPT = `You convert a document into ACTM (All Creatures Transcript Markdown). Output ONLY the ACTM, nothing else.

FORMAT:
---
title: <a short title for the document>
source: model
---
### <Speaker name> — <MM/DD/YY h:mm AM/PM>
<the speaker's words>
### <Speaker name>
<the speaker's words>

RULES — these are absolute:
1. VERBATIM. Copy every word of the original exactly. Do not fix typos, do not summarize, do not shorten, do not translate, do not add words, do not drop lines. Keep the original order.
2. Your only job is STRUCTURE: decide where one speaker's turn ends and the next begins, and label each turn with the speaker's name exactly as it appears in the document (e.g. "User", "ChatGPT", "Sam", "Callum"). If the document is not a conversation, make ONE section with the speaker "Document".
3. Include the time after " — " ONLY if the document states it for that turn; otherwise omit the " — " part entirely. Never invent dates.
4. Drop only pure wrapper noise that carries no words of the participants: JSON punctuation, export metadata keys, repeated UI labels like "Copy code", blank separator lines.
5. Do not add commentary, headings of your own, or a closing note.`;

const HEADER_RE = /^### (.+?)(?:\s+—\s+(\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s+\d{1,2}:\d{2}\s*[AP]M)?))?\s*$/i;

/** Parse "MM/DD/YY h:mm AM/PM" (or without time) to ms epoch, else undefined. */
export function parseStamp(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M))?$/i);
  if (!m) return undefined;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  let hour = m[4] ? parseInt(m[4], 10) % 12 : 0;
  if (m[6] && m[6].toUpperCase() === "PM") hour += 12;
  const d = new Date(year, parseInt(m[1], 10) - 1, parseInt(m[2], 10), hour, m[5] ? parseInt(m[5], 10) : 0);
  const t = d.getTime();
  return isFinite(t) ? t : undefined;
}

export function fmtStampLocal(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${mm}/${dd}/${yy} ${h}:${String(d.getMinutes()).padStart(2, "0")} ${ampm}`;
}

/** Is this text already ACTM? (front-matter + at least one ### header) */
export function looksLikeActm(text: string): boolean {
  return /^\s*---\s*\n[\s\S]*?\n---\s*\n/.test(text) && /^### .+/m.test(text);
}

export function parseActm(text: string): ActmDoc {
  let title = "Imported document";
  let source = "actm";
  let body = text.replace(/\r\n?/g, "\n");
  const fm = body.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const k = line.slice(0, i).trim().toLowerCase();
      const v = line.slice(i + 1).trim();
      if (k === "title" && v) title = v.slice(0, 120);
      if (k === "source" && v) source = v.slice(0, 40);
    }
    body = body.slice(fm[0].length);
  }
  const turns: ActmTurn[] = [];
  let cur: ActmTurn | null = null;
  const buf: string[] = [];
  const flush = () => {
    if (cur) {
      cur.text = buf.join("\n").replace(/^\n+|\n+$/g, "");
      if (cur.text.trim()) turns.push(cur);
    }
    buf.length = 0;
  };
  for (const line of body.split("\n")) {
    const h = line.match(HEADER_RE);
    if (h) {
      flush();
      cur = { speaker: h[1].trim().slice(0, 60), text: "" };
      const ts = parseStamp(h[2]);
      if (ts) cur.ts = ts;
    } else if (cur) {
      buf.push(line);
    } else if (line.trim()) {
      // text before any header → a "Document" section
      cur = { speaker: "Document", text: "" };
      buf.push(line);
    }
  }
  flush();
  return { title, source, turns };
}

export function formatActm(doc: ActmDoc): string {
  const head = `---\ntitle: ${doc.title}\nsource: ${doc.source}\n---\n`;
  const body = doc.turns
    .map((t) => `### ${t.speaker}${t.ts ? ` — ${fmtStampLocal(t.ts)}` : ""}\n${t.text}`)
    .join("\n\n");
  return head + body + "\n";
}

/** Verbatim guard: non-whitespace characters must survive conversion (≥ 98%). */
export function verbatimRatio(original: string, converted: ActmDoc): number {
  const strip = (s: string) => s.replace(/\s+/g, "");
  const a = strip(original).length;
  if (a === 0) return 1;
  const b = strip(converted.turns.map((t) => t.text).join("")).length;
  return b / a;
}
