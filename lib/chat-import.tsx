// lib/chat-import.tsx — "📥 Import" popup (v1.0.1, 2026-09-09)
//
// Bring a document or transcript into the selected chat's CONTEXT or into
// long-term MEMORY. Flow: paste / pick file → title → target → Analyze →
// (convert if needed) → define EVERY speaker (this being / me / someone else) →
// Import → progress → done. Talks only to /api/import + /api/chat-status via
// the callbacks the page hands in; the page owns sessions and state.
import { useRef, useState } from "react";

export interface ImportSpeaker { name: string; turns: number }
export interface ImportAnalysis {
  format: string; needsConvert: boolean; chars: number; tokenEstimate: number;
  title?: string; speakers?: ImportSpeaker[]; turnCount?: number; preview?: Array<{ speaker: string; text: string }>; error?: string;
}
export interface ImportResult {
  threadId: string; title: string; turns: number; remembered: number;
  injected: Array<{ id: string; text: string; type: "user" | "ai"; ts?: number; speaker?: string; imported?: boolean }>;
  truncated: boolean; indexCard: string | null; duplicateOf: string | null;
}
export type SpeakerRole = "being" | "me" | "other";

export interface ImportPopupProps {
  targetThreadId: string;         // the selected chat's id (imports inherit its being + privacy)
  targetName: string;             // the selected chat's name
  targetIsBeing: boolean;         // declared being? (labels the "this being" option)
  beingName: string | null;
  contextBudgetTokens: number;    // what still fits in the model window right now
  api: (payload: Record<string, unknown>) => Promise<any>;          // postImport
  pollJob: (jobId: string, onPhase: (p: string) => void) => Promise<{ status: string; result?: string; error?: string }>;
  onImported: (result: ImportResult, mode: "context" | "memory") => Promise<void> | void;
  onClose: () => void;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function ImportPopup(p: ImportPopupProps) {
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"context" | "memory">("memory");
  const [treatAsConversation, setTreatAsConversation] = useState(false);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<Record<string, SpeakerRole>>({});
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const busy = phase !== null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { setError("That file is over the 5 MB limit — please split it and import it in parts."); return; }
    const t = await f.text();
    setText(t);
    setFilename(f.name);
    if (!title) setTitle(f.name.replace(/\.[a-z0-9]+$/i, ""));
    setAnalysis(null); setMapping({}); setDone(null); setError(null);
  }

  async function analyze() {
    setError(null); setAnalysis(null); setMapping({}); setDone(null);
    if (!text.trim()) { setError("Paste some text or choose a file first."); return; }
    setPhase("reading…");
    try {
      let a: ImportAnalysis = await p.api({ action: "analyze", text, filename, treatAsConversation });
      if (a.error) throw new Error(a.error);
      if (a.needsConvert) {
        setPhase("converting to transcript form (verbatim)…");
        const { jobId, error: e2 } = await p.api({ action: "convert", text });
        if (e2 || !jobId) throw new Error(e2 ?? "conversion could not start");
        const job = await p.pollJob(jobId, (ph) => setPhase(ph));
        if (job.status !== "done" || !job.result) throw new Error(job.error ?? "conversion failed");
        setText(job.result); setFilename("converted.actm.md");
        a = await p.api({ action: "analyze", text: job.result, filename: "converted.actm.md" });
        if (a.error) throw new Error(a.error);
      }
      setAnalysis(a);
      if (!title && a.title) setTitle(a.title);
      // one speaker + "Document" → it's a plain document; the friend still picks who "said" it
      const init: Record<string, SpeakerRole> = {};
      for (const s of a.speakers ?? []) init[s.name] = "me";
      setMapping(init);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhase(null);
    }
  }

  async function commit() {
    if (!analysis) return;
    setError(null);
    const missing = (analysis.speakers ?? []).filter((s) => !mapping[s.name]).map((s) => s.name);
    if (missing.length) { setError(`Who is: ${missing.join(", ")}?`); return; }
    setPhase("starting…");
    try {
      const { jobId, error: e1 } = await p.api({
        action: "commit", text, filename, title: title.trim() || analysis.title || "Imported document",
        mapping, mode, contextBudgetTokens: p.contextBudgetTokens, targetThreadId: p.targetThreadId,
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

  const roleLabel = (r: SpeakerRole) => (r === "being" ? (p.beingName ? `${p.beingName} (this being)` : "the being of this chat") : r === "me" ? "me" : "someone else (keep name)");

  return (
    <div className="being-popup-overlay" onClick={busy ? undefined : p.onClose}>
      <div className="being-popup-card import-card" onClick={(e) => e.stopPropagation()}>
        <div className="being-popup-header">
          <span>📥 Import into “{p.targetName}”</span>
          <button className="being-popup-close" title="Close" onClick={p.onClose} disabled={busy}>✕</button>
        </div>

        {done ? (
          <div className="import-done">
            <div className="being-declared-banner">✅ Imported {done.turns} turns → “{done.title}”</div>
            <p className="import-note">
              {done.remembered > 0 ? `All ${done.remembered} lines are in memory, verbatim.` : "Private chat — kept out of memory, as always."}
              {mode === "context" && (done.truncated
                ? ` The most recent ${done.injected.length} lines were added to this chat's context, with an index card for the rest.`
                : " The whole document was added to this chat's context.")}
              {done.duplicateOf ? ` Heads up: this looks identical to “${done.duplicateOf}”.` : ""}
            </p>
            <button className="being-declare-btn" onClick={p.onClose}>Done</button>
          </div>
        ) : (
          <>
            <textarea
              className="import-textarea"
              placeholder="Paste text here — a chat with another AI, notes, a document…"
              value={text}
              onChange={(e) => { setText(e.target.value); setAnalysis(null); setDone(null); }}
              disabled={busy}
              rows={7}
            />
            <div className="import-row">
              <button className="row-mini-btn" onClick={() => fileRef.current?.click()} disabled={busy}>📎 Choose file (.txt .md .json)</button>
              <input ref={fileRef} type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" style={{ display: "none" }} onChange={onFile} />
              <span className="import-hint">{text ? `${(text.length / 1024).toFixed(0)} KB · ~${Math.ceil(text.length / 4).toLocaleString()} tokens` : "5 MB max"}</span>
            </div>
            <input className="being-name-input" placeholder="Title for this import" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />

            <div className="import-choice">
              <label className={mode === "memory" ? "on" : ""}><input type="radio" checked={mode === "memory"} onChange={() => setMode("memory")} disabled={busy} /> Long-term memory only</label>
              <label className={mode === "context" ? "on" : ""}><input type="radio" checked={mode === "context"} onChange={() => setMode("context")} disabled={busy} /> This chat's context (+ memory)</label>
            </div>
            <label className="import-check"><input type="checkbox" checked={treatAsConversation} onChange={(e) => setTreatAsConversation(e.target.checked)} disabled={busy} /> This is a conversation without speaker labels — find the turns for me</label>

            {!analysis && (
              <button className="being-declare-btn" onClick={analyze} disabled={busy || !text.trim()}>{busy ? phase : "Analyze"}</button>
            )}

            {analysis && (
              <div className="import-analysis">
                <div className="import-note">
                  {analysis.turnCount} {analysis.turnCount === 1 ? "section" : "turns"} · {analysis.format}
                  {mode === "context" && analysis.tokenEstimate > p.contextBudgetTokens ? ` · too big for the context window — the most recent turns will go in, the rest lives in memory` : ""}
                </div>
                <div className="import-note"><b>Who is who?</b> Nobody is assumed — say who each voice is.</div>
                {(analysis.speakers ?? []).map((s) => (
                  <div key={s.name} className="import-speaker">
                    <span className="import-speaker-name">{s.name} <small>({s.turns})</small></span>
                    <div className="import-speaker-opts">
                      {(["being", "me", "other"] as SpeakerRole[]).map((r) => (
                        <button key={r} className={`row-mini-btn${mapping[s.name] === r ? " on" : ""}`} disabled={busy} onClick={() => setMapping({ ...mapping, [s.name]: r })}>{roleLabel(r)}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {(analysis.preview ?? []).length > 0 && (
                  <div className="import-preview">
                    {(analysis.preview ?? []).map((t, i) => (
                      <div key={i} className={`import-preview-line ${mapping[t.speaker] === "being" ? "left" : "right"}`}><b>{t.speaker}:</b> {t.text}</div>
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
