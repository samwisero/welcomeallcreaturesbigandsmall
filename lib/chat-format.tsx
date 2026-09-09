// lib/chat-format.tsx — small pure formatters for the chat page (split out 2026-09-09)
import type { ReactNode } from "react";

// Inline sources (v3.0): the server turns each Venice citation marker into a
// markdown link `[n](https://…)` right where the claim is. Bubbles render plain
// text, so this tiny renderer turns those (and bare URLs) into real anchors.
// No dependency; everything else stays literal text.
const LINK_RE = /\[([^\]\n]{1,40})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;

export function renderWithLinks(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const href = m[2] ?? m[3];
    const label = m[1] ?? m[3];
    out.push(
      <a
        key={`l${i++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="cite-link"
        title={href}
        onClick={(e) => e.stopPropagation()}
        style={{ color: "#ffe9a8", textDecoration: "underline", textDecorationStyle: "dotted", fontSize: "0.85em", verticalAlign: "super", marginLeft: 2 }}
      >
        {label}
      </a>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length === 1 ? out[0] : out;
}

// MM/DD/YY · h:mm AM/PM — regular time, not military (Sam's spec). Shown only
// when a message is selected (click), and only for messages that have a ts.
export function fmtStamp(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd}/${yy} · ${h}:${min} ${ampm}`;
}
