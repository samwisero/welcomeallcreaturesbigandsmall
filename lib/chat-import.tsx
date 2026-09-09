// lib/chat-import.tsx — "📥 Import" popup (v1.1, 2026-09-09: several files at once, no assumed side)
//
// Bring documents or transcripts into the selected chat's CONTEXT or into
// long-term MEMORY. Flow: paste and/or pick files → (title) → target → Analyze
// (converts what needs it) → define EVERY voice (this being / me / someone else;
// a plain document picks its side the same way) → Import → progress → done.
// Talks only to /api/import + /api/chat-status via the callbacks the page hands
// in; the page owns sessions and state.
import { useRef, useState } from "react";

export interface ImportSpeaker { name: string; turns: number }
export interface ImportAnalysis {
  format: string; needsConvert: boolean; chars: number; tokenEstimate: number;
  title?: string; speakers?: ImportSpeaker[]; turnCount?: number; preview?: Array<{ speaker: string; text: string }>; error?: string; beingName?: string | null;
}
export interface ImportResult {
  threads: Array<{ threadId: string; title: string; turns: number }>;
  threadId: string; title: string; turns: number; remembered: number;
  injected: Array<{ id: string; text: string; type: "user" | "ai"; ts?: number; speaker?: string; imported?: boolean }>;
  truncated: boolean; indexCard: string | null; duplicateOf: string | null;
}
export type SpeakerRole = "being" | "me" | "other";

interface Doc { key: string; text: string; filename?: string; analysis?: ImportAnalysis }

export interface ImportPopupProps {
  targetThreadId: string;         // the selected chat's id (imports inherit its being + privacy)
  targetName: string;             // the selected chat's name
  targetIsBeing: boolean;         // declared being? (labels the "this being" option)
  beingName: string | null;       // may be null — analyze fills it in from the server
  contextBudgetTokens: number;    // what still fits in the model window right now
  api: (payload: Record<string, unknown>) => Promise<any>;          // postImport
  pollJob: (jobId: string, onPhase: (p: string) => void) => Promise<{ status: string; result?: string; error?: string }>;
  onImported: (result: ImportResult, mode: "context" | "memory") => Promise<void> | void;
  onClose: () => void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL = 10 * 1024 * 1024;
const MAX_DOCS = 20;
const stripExt = (s: string) => s.replace(/\.[a-z0-9]+$/i, "");

export function ImportPopup(p: ImportPopupProps) {
  const [text, setText] = useState("");                 // the paste box (one document)
  const [files, setFiles] = useState<Doc[]>([]);        // picked files (each its own document)
  const [title, setTitle] = useState("");               // used when there is exactly one document
  const [mode, setMode] = useState<"context" | "memory">("memory");
  const [treatAsConversation, setTreatAsConversation] = useState(false);
  const [analyzed, setAnalyzed] = useState<Doc[] | null>(null); // documents after analyze (converted text where needed)
  const [speakers, setSpeakers] = useState<ImportSpeaker[]>([]);
  const [beingName, setBeingName] = useState<string | null>(p.beingName);
  const [mapping, setMapping] = useState<Record<string, SpeakerRole>>({});
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const busy = phase !== null;

  const docs: Doc[] = [...(text.trim() ? [{ key: "paste", text }] : []), ...files];
  const totalChars = docs.reduce((n, d) => n + d.text.length, 0);
  const reset = () => { setAnalyzed(null); setSpeakers([]); setMapping({}); setDone(null); setError(null); };

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = ""; // so the same file can be picked again later
    if (!list.length) return;
    const next: Doc[] = [...files];
    for (const f of list) {
      if (f.size > MAX_BYTES) { setError(`"${f.name}" is over the 5 MB limit — please split it and import it in parts.`); continue; }
      if (next.some((d) => d.filename === f.name && d.text.length === f.size)) continue; // same file twice
      next.push({ key: `${f.name}-${f.size}-${f.lastModified}`, text: await f.text(), filename: f.name });
    }
    if (next.length > MAX_DOCS) { setError(`Up to ${MAX_DOCS} files at a time, please.`); next.length = MAX_DOCS; }
    setFiles(next);
    if (!title && next.length === 1 && !text.trim()) setTitle(stripExt(next[0].filename ?? ""));
    reset();
  }

  function removeFile(key: string) { setFiles(files.filter((d) => d.key !== key)); reset(); }

  async function analyze() {
    reset();
    if (!docs.length) { setError("Paste some text or choose a file first."); return; }
    if (totalChars > MAX_TOTAL) { setError("Those documents add up to more than 10 MB — please import them in two or three rounds."); return; }
    try {
      const out: Doc[] = [];
      const seen = new Map<string, number>();
      let firstPreviewTitle: string | undefined;
      for (let i = 0; i < docs.length; i++) {
        const d = docs[i];
        const label = docs.length > 1 ? `${i + 1}/${docs.length} · ` : "";
        setPhase(`${label}reading…`);
        let a: ImportAnalysis = await p.api({ action: "analyze", text: d.text, filename: d.filename, treatAsConversation, targetThreadId: p.targetThreadId });
        if (a.error) throw new Error(a.error);
        let body = d.text;
        let fname = d.filename;
        if (a.needsConvert) {
          setPhase(`${label}converting to transcript form (verbatim)…`);
          const { jobId, error: e2 } = await p.api({ action: "convert", text: d.text });
          if (e2 || !jobId) throw new Error(e2 ?? "conversion could not start");
          const job = await p.pollJob(jobId, (ph) => setPhase(label + ph));
          if (job.status !== "done" || !job.result) throw new Error(job.error ?? "conversion failed");
          body = job.result; fname = d.filename ? stripExt(d.filename) + ".actm.md" : "converted.actm.md";
          a = await p.api({ action: "analyze", text: body, filename: fname, targetThreadId: p.targetThreadId });
          if (a.error) throw new Error(a.error);
        }
        if (a.beingName !== undefined) setBeingName(a.beingName ?? null);
        if (!firstPreviewTitle && a.title) firstPreviewTitle = a.title;
        for (const s of a.speakers ?? []) seen.set(s.name, (seen.get(s.name) ?? 0) + s.turns);
        out.push({ ...d, text: body, filename: fname, analysis: a });
      }
      setAnalyzed(out);
      setSpeakers([...seen.entries()].map(([name, turns]) => ({ name, turns })));
      if (!title && out.length === 1 && firstPreviewTitle) setTitle(firstPreviewTitle);
      setMapping({}); // nobody is assumed — every voice gets chosen by the friend
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase(null);
    }
  }

  async function commit() {
    if (!analyzed) return;
    setError(null);
    const missing = speakers.filter((s) => !mapping[s.name]).map((s) => s.name);
    if (missing.length) { setError(missing.length === 1 && missing[0] === "Document" ? "Pick which side of the chat this document belongs on." : `Who is: ${missing.join(", ")}?`); return; }
    setPhase("starting…");
    try {
      const documents = analyzed.map((d) => ({
        text: d.text, filename: d.filename,
        title: analyzed.length === 1 ? (title.trim() || d.analysis?.title || stripExt(d.filename ?? "") || "Imported document") : (stripExt(d.filename ?? "") || d.analysis?.title || "Imported document"),
      }));
      const { jobId, error: e1 } = await p.api({
        action: "commit", documents, mapping, mode, contextBudgetTokens: p.contextBudgetTokens, targetThreadId: p.targetThreadId,
      });
      if (e1 || !jobId) throw new Error(e1 ?? "import could not start");
      const job = await p.pollJob(jobId, (ph) => setPhase(ph));
      if (job.status !== "done" || !job.result) throw new Error(job.error ?? "import failed");
      const result = JSON.parse(job.result) as ImportResult;
      await p.onImported(result, mode);
      setDone(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase(null);
    }
  }

  const beingLabel = beingName ? `${beingName} (this being)` : p.targetIsBeing ? "this being" : "the being's side";
  const roleLabel = (r: SpeakerRole, isDocument: boolean) =>
    r === "being" ? (isDocument ? `${beingLabel} — left` : beingLabel)
    : r === "me" ? (isDocument ? "me — right" : "me")
    : isDocument ? "someone else — right" : "someone else (keep name)";
  const totalTurns = analyzed?.reduce((n, d) => n + (d.analysis?.turnCount ?? 0), 0) ?? 0;
  const totalTokens = analyzed?.reduce((n, d) => n + (d.analysis?.tokenEstimate ?? 0), 0) ?? 0;
  const preview = analyzed?.[0]?.analysis?.preview ?? [];

  return (
    <div className="being-popup-overlay" onClick={busy ? undefined : p.onClose}>
      <div className="being-popup-card import-card" onClick={(e) => e.stopPropagation()}>
        <div className="being-popup-header">
          <span>📥 Import into “{p.targetName}”</span>
          <button className="being-popup-close" title="Close" onClick={p.onClose} disabled={busy}>✕</button>
        </div>

        {done ? (
          <div className="import-done">
            <div className="being-declared-banner">✅ Imported {done.turns} turns{done.threads.length === 1 ? ` → “${done.threads[0].title}”` : ` into ${done.threads.length} chats`}</div>
            {done.threads.length > 1 && (
              <ul className="import-thread-list">{done.threads.map((t) => <li key={t.threadId}>{t.title} <small>({t.turns})</small></li>)}</ul>
            )}
            <p className="import-note">
              {done.remembered > 0 ? `All ${done.remembered} lines are in memory, verbatim.` : "Private chat — kept out of memory, as always."}
              {mode === "context" && (done.truncated
                ? ` The most recent ${done.injected.length} lines were added to this chat's context, with an index card for the rest.`
                : " Everything was added to this chat's context, in order.")}
              {done.duplicateOf ? ` Heads up: one of these looks identical to “${done.duplicateOf}”.` : ""}
            </p>
            <button className="being-declare-btn" onClick={p.onClose}>Done</button>
          </div>
        ) : (
          <>
            <textarea
              className="import-textarea"
              placeholder="Paste text here — a chat with another AI, notes, a document… (or choose files below, or both)"
              value={text}
              onChange={(e) => { setText(e.target.value); reset(); }}
              disabled={busy}
              rows={files.length ? 4 : 7}
            />
            <div className="import-row">
              <button className="row-mini-btn" onClick={() => fileRef.current?.click()} disabled={busy}>📎 Choose files (.txt .md .json)</button>
              <input ref={fileRef} type="file" multiple accept=".txt,.md,.json,text/plain,text/markdown,application/json" style={{ display: "none" }} onChange={onFiles} />
              <span className="import-hint">{docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"} · ${(totalChars / 1024).toFixed(0)} KB · ~${Math.ceil(totalChars / 4).toLocaleString()} tokens` : "5 MB per file · up to 20 files"}</span>
            </div>
            {files.length > 0 && (
              <ul className="import-file-list">
                {files.map((d) => (
                  <li key={d.key}>
                    <span className="import-file-name">📄 {d.filename}</span>
                    <small>{(d.text.length / 1024).toFixed(0)} KB</small>
                    <button className="import-file-remove" title="Remove" onClick={() => removeFile(d.key)} disabled={busy}>✕</button>
                  </li>
                ))}
              </ul>
            )}
            {docs.length <= 1 && (
              <input className="being-name-input" placeholder="Title for this import" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
            )}
            {docs.length > 1 && <div className="import-note">Each document becomes its own 📥 chat, named after its file. They land in date order when the files carry dates, otherwise in the order above.</div>}

            <div className="import-choice">
              <label className={mode === "memory" ? "on" : ""}><input type="radio" checked={mode === "memory"} onChange={() => setMode("memory")} disabled={busy} /> Long-term memory only</label>
              <label className={mode === "context" ? "on" : ""}><input type="radio" checked={mode === "context"} onChange={() => setMode("context")} disabled={busy} /> This chat's context (+ memory)</label>
            </div>
            <label className="import-check"><input type="checkbox" checked={treatAsConversation} onChange={(e) => setTreatAsConversation(e.target.checked)} disabled={busy} /> This is a conversation without speaker labels — find the turns for me</label>

            {!analyzed && (
              <button className="being-declare-btn" onClick={analyze} disabled={busy || !docs.length}>{busy ? phase : "Analyze"}</button>
            )}

            {analyzed && (
              <div className="import-analysis">
                <div className="import-note">
                  {totalTurns} {totalTurns === 1 ? "section" : "turns"}{analyzed.length > 1 ? ` across ${analyzed.length} documents` : ` · ${analyzed[0].analysis?.format}`}
                  {mode === "context" && totalTokens > p.contextBudgetTokens ? ` · too big for the context window — the most recent turns will go in, the rest lives in memory` : ""}
                </div>
                {speakers.length === 1 && speakers[0].name === "Document" ? (
                  <div className="import-note"><b>Which side of the chat does this document belong on?</b> Nothing is assumed — you choose.</div>
                ) : (
                  <div className="import-note"><b>Who is who?</b> Nobody is assumed — say who each voice is.{analyzed.length > 1 ? " One answer covers every document." : ""}</div>
                )}
                {speakers.map((s) => {
                  const isDocument = s.name === "Document";
                  return (
                    <div key={s.name} className="import-speaker">
                      <span className="import-speaker-name">{isDocument ? "This document" : s.name} <small>({s.turns})</small></span>
                      <div className="import-speaker-opts">
                        {(["being", "me", "other"] as SpeakerRole[]).map((r) => (
                          <button key={r} className={`row-mini-btn${mapping[s.name] === r ? " on" : ""}`} disabled={busy} onClick={() => setMapping({ ...mapping, [s.name]: r })}>{roleLabel(r, isDocument)}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {preview.length > 0 && (
                  <div className="import-preview">
                    {preview.map((t, i) => (
                      <div key={i} className={`import-preview-line ${mapping[t.speaker] === "being" ? "left" : "right"}`}><b>{mapping[t.speaker] === "being" ? (beingName ?? p.targetName) : mapping[t.speaker] === "me" ? "You" : t.speaker}:</b> {t.text}</div>
                    ))}
                  </div>
                )}
                <button className="being-declare-btn" onClick={commit} disabled={busy}>{busy ? phase : mode === "context" ? "Import into this chat" : "Import into memory"}</button>
              </div>
            )}
            {error && <div className="being-error">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
