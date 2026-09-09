// lib/import-convert.ts — turn any pasted/uploaded document into an ActmDoc (v1.1, 2026-09-09: lowercase labels, treatAsConversation)
//
// Deterministic first, model last:
//   chatgpt-json  ChatGPT data export (conversations.json or one conversation) — exact
//   role-array    [{role, content}] or {messages:[...]} (API-style transcripts) — exact
//   actm          already our format — exact
//   name-lines    "Name: words" lines with ≥2 recurring names — exact
//   plain         no turns detected → one "Document" section — exact
//   model         messy conversational text → DeepSeek converts to ACTM (VERBATIM rule + guard)
// Nothing here writes to the database.
import { generateText } from "ai";
import { ACTM_CONVERTER_PROMPT, parseActm, looksLikeActm, verbatimRatio, type ActmDoc, type ActmTurn } from "./actm";
import { endpointFor, modelFor } from "./providers";

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per import (Sam 2026-09-09)
export const CONVERTER_MODEL = "deepseek-v4-flash-0731"; // Venice, 1M ctx
const CHUNK_CHARS = 360_000; // ~90k tokens per converter call — well inside the window, safe under our job timeouts

export type ImportFormat = "chatgpt-json" | "role-array" | "actm" | "name-lines" | "plain" | "model";

export interface Analysis {
  format: ImportFormat;
  needsConvert: boolean; // true → run convertWithModel first
  doc: ActmDoc | null;   // present when deterministic
  chars: number;
  tokenEstimate: number; // chars / 4
}

export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

// ---------------------------------------------------------------------------
// ChatGPT export
// ---------------------------------------------------------------------------
interface CgptNode { id?: string; message?: { author?: { role?: string; name?: string }; content?: { parts?: unknown[]; text?: string }; create_time?: number | null } | null; parent?: string | null; children?: string[] }
interface CgptConversation { title?: string; mapping?: Record<string, CgptNode>; create_time?: number }

function cgptText(msg: NonNullable<CgptNode["message"]>): string {
  const c = msg.content;
  if (!c) return "";
  if (typeof c.text === "string") return c.text;
  if (Array.isArray(c.parts)) return c.parts.filter((p) => typeof p === "string").join("\n");
  return "";
}

function parseChatGptConversation(conv: CgptConversation): ActmDoc | null {
  const map = conv.mapping;
  if (!map || typeof map !== "object") return null;
  // walk from the root down the (first) child chain — the visible thread
  const nodes = Object.values(map);
  let root = nodes.find((n) => !n.parent) ?? nodes[0];
  const turns: ActmTurn[] = [];
  const seen = new Set<string>();
  let cur: CgptNode | undefined = root;
  while (cur && cur.id && !seen.has(cur.id)) {
    seen.add(cur.id);
    const m = cur.message;
    if (m && m.author && (m.author.role === "user" || m.author.role === "assistant")) {
      const text = cgptText(m).trim();
      if (text) {
        const speaker = m.author.role === "user" ? "User" : "ChatGPT";
        const t: ActmTurn = { speaker, text };
        if (typeof m.create_time === "number" && m.create_time > 0) t.ts = Math.round(m.create_time * 1000);
        turns.push(t);
      }
    }
    const kids = Array.isArray(cur.children) ? cur.children : [];
    cur = kids.length ? map[kids[kids.length - 1]] : undefined; // last child = the branch the user kept
  }
  if (turns.length === 0) return null;
  return { title: (conv.title ?? "ChatGPT conversation").slice(0, 120), source: "chatgpt-json", turns };
}

function parseChatGptExport(data: unknown): ActmDoc | null {
  if (Array.isArray(data)) {
    // conversations.json → merge all conversations, each as its own run of turns
    const docs = data.map((c) => parseChatGptConversation(c as CgptConversation)).filter(Boolean) as ActmDoc[];
    if (docs.length === 0) return null;
    if (docs.length === 1) return docs[0];
    const turns: ActmTurn[] = [];
    for (const d of docs) turns.push(...d.turns);
    return { title: `${docs.length} ChatGPT conversations`, source: "chatgpt-json", turns };
  }
  if (data && typeof data === "object" && "mapping" in (data as object)) return parseChatGptConversation(data as CgptConversation);
  return null;
}

// ---------------------------------------------------------------------------
// [{role, content}] arrays
// ---------------------------------------------------------------------------
function parseRoleArray(data: unknown): ActmDoc | null {
  const arr = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { messages?: unknown[] }).messages) ? (data as { messages: unknown[] }).messages : null;
  if (!arr || arr.length === 0) return null;
  const turns: ActmTurn[] = [];
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const o = it as { role?: string; content?: unknown; name?: string; speaker?: string; text?: string; ts?: number; timestamp?: string | number };
    const text = typeof o.content === "string" ? o.content : typeof o.text === "string" ? o.text : Array.isArray(o.content) ? (o.content as unknown[]).map((p) => (typeof p === "string" ? p : (p as { text?: string })?.text ?? "")).join("\n") : "";
    if (!text.trim()) continue;
    const speaker = (o.speaker || o.name || (o.role === "assistant" ? "Assistant" : o.role === "user" ? "User" : o.role) || "Speaker").toString().slice(0, 60);
    if (speaker === "system") continue;
    const t: ActmTurn = { speaker, text: text.trim() };
    const ts = typeof o.ts === "number" ? o.ts : typeof o.timestamp === "number" ? (o.timestamp > 1e12 ? o.timestamp : o.timestamp * 1000) : typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    if (isFinite(ts) && ts > 0) t.ts = ts;
    turns.push(t);
  }
  return turns.length ? { title: "Imported transcript", source: "role-array", turns } : null;
}

// ---------------------------------------------------------------------------
// "Name: words" lines
// ---------------------------------------------------------------------------
const NAME_LINE_RE = /^([A-Za-z][\w .'\-]{0,30}?):\s+(.*)$/; // "Sam:", "user:", "ChatGPT:" …

function parseNameLines(text: string): ActmDoc | null {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const counts = new Map<string, number>();
  for (const l of lines) {
    const m = l.match(NAME_LINE_RE);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  const names = [...counts.entries()].filter(([, n]) => n >= 2).map(([k]) => k);
  if (names.length < 2) return null;
  const nameSet = new Set(names);
  const turns: ActmTurn[] = [];
  let cur: ActmTurn | null = null;
  for (const l of lines) {
    const m = l.match(NAME_LINE_RE);
    if (m && nameSet.has(m[1])) {
      if (cur && cur.text.trim()) turns.push(cur);
      cur = { speaker: m[1], text: m[2] };
    } else if (cur) {
      cur.text += "\n" + l;
    } else if (l.trim()) {
      cur = { speaker: "Document", text: l };
    }
  }
  if (cur && cur.text.trim()) turns.push(cur);
  for (const t of turns) t.text = t.text.replace(/^\n+|\n+$/g, "");
  return turns.length ? { title: "Imported conversation", source: "name-lines", turns } : null;
}

// ---------------------------------------------------------------------------
// analyze — deterministic where possible
// ---------------------------------------------------------------------------
export function analyzeDocument(raw: string, filename?: string, treatAsConversation = false): Analysis {
  const text = raw.replace(/^﻿/, "");
  const base = { chars: text.length, tokenEstimate: estimateTokens(text) };
  const trimmed = text.trim();

  // JSON?
  if ((filename ?? "").toLowerCase().endsWith(".json") || /^[\[{]/.test(trimmed)) {
    try {
      const data = JSON.parse(trimmed);
      const cg = parseChatGptExport(data);
      if (cg) return { format: "chatgpt-json", needsConvert: false, doc: cg, ...base };
      const ra = parseRoleArray(data);
      if (ra) return { format: "role-array", needsConvert: false, doc: ra, ...base };
    } catch { /* not JSON after all — fall through to text */ }
  }
  if (looksLikeActm(text)) {
    const doc = parseActm(text);
    if (doc.turns.length) return { format: "actm", needsConvert: false, doc, ...base };
  }
  const nl = parseNameLines(text);
  if (nl) return { format: "name-lines", needsConvert: false, doc: nl, ...base };
  // The friend told us it's a conversation but nothing above found the turns → the converter finds them.
  if (treatAsConversation) return { format: "model", needsConvert: true, doc: null, ...base };

  // Conversational-looking but unstructured? → model. Otherwise plain document.
  const conversational = /\b(you|your|me|I)\b/i.test(text) && /\n\s*\n/.test(text) && /[?!]/.test(text) && text.length > 200 && /^(user|assistant|ai|human|chatgpt|claude|gemini|q|a)\b[:\s]/im.test(text);
  if (conversational) return { format: "model", needsConvert: true, doc: null, ...base };
  const title = (filename ?? "").replace(/\.[a-z0-9]+$/i, "") || (trimmed.split("\n")[0] ?? "Imported document").slice(0, 80);
  return { format: "plain", needsConvert: false, doc: { title: title || "Imported document", source: "plain", turns: [{ speaker: "Document", text: trimmed }] }, ...base };
}

// ---------------------------------------------------------------------------
// convert — DeepSeek on Venice, chunked, verbatim-guarded
// ---------------------------------------------------------------------------
export async function convertWithModel(raw: string, onProgress?: (done: number, total: number) => Promise<void> | void): Promise<ActmDoc> {
  const { baseURL, key } = endpointFor("venice");
  if (!key) throw new Error("VENICE_AI is not configured");
  const model = modelFor("venice", baseURL, key, CONVERTER_MODEL);
  const text = raw.replace(/\r\n?/g, "\n");

  // chunk on blank lines so we never split a turn mid-sentence
  const chunks: string[] = [];
  let cur = "";
  for (const para of text.split(/\n\s*\n/)) {
    if (cur.length + para.length + 2 > CHUNK_CHARS && cur) { chunks.push(cur); cur = ""; }
    cur += (cur ? "\n\n" : "") + para;
  }
  if (cur) chunks.push(cur);

  const turns: ActmTurn[] = [];
  let title = "Imported conversation";
  for (let i = 0; i < chunks.length; i++) {
    const r = await generateText({
      model,
      system: ACTM_CONVERTER_PROMPT,
      prompt: chunks[i],
      temperature: 0,
      providerOptions: { venice: { venice_parameters: { include_venice_system_prompt: false, enable_web_search: "off", disable_thinking: true } } },
    });
    const doc = parseActm(r.text);
    if (i === 0 && doc.title && doc.title !== "Imported document") title = doc.title;
    // verbatim guard per chunk — fail loudly, never write a paraphrase
    const ratio = verbatimRatio(chunks[i], doc);
    if (ratio < 0.98) throw new Error(`Conversion lost text (kept ${(ratio * 100).toFixed(1)}%). Nothing was imported — try pasting a cleaner copy or a .json export.`);
    turns.push(...doc.turns);
    if (onProgress) await onProgress(i + 1, chunks.length);
  }
  return { title, source: "model", turns };
}

/** Distinct speakers in order of first appearance, with turn counts. */
export function speakerSummary(doc: ActmDoc): Array<{ name: string; turns: number }> {
  const m = new Map<string, number>();
  for (const t of doc.turns) m.set(t.speaker, (m.get(t.speaker) ?? 0) + 1);
  return [...m.entries()].map(([name, turns]) => ({ name, turns }));
}
