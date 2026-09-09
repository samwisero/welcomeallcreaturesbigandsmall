// lib/chat-widgets.tsx — small reusable widgets for the chat page (split out 2026-09-09)
import { useState, useEffect, useRef } from "react";

// ---- Dropdown -----------------------------------------------------------
// Small gold dropdown that replaces native <select>. Native pickers are
// "massive" on mobile (full-screen wheel selectors); this one stays compact
// and matches the chat-bubble color palette. Click outside or press Escape
// to close.
interface DropdownOption {
  value: string;
  label: string;
  title?: string;
}
interface DropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (v: string) => void;
  title?: string;
  menuAlign?: "left" | "right";
  unknownLabel?: string;
}

export function Dropdown(props: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const match = props.options.find((o) => o.value === props.value);
  const buttonLabel = match
    ? match.label
    : props.unknownLabel || `${props.value} (unknown)`;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="dd-wrap"
      ref={wrapRef}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="dd-btn"
        title={props.title}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="dd-label">{buttonLabel}</span>
        <span className="dd-caret">▾</span>
      </button>
      {open && (
        <div className={`dd-menu${props.menuAlign === "left" ? " from-left" : ""}`}>
          {props.options.map((opt) => (
            <div
              key={opt.value}
              className={`dd-option${opt.value === props.value ? " selected" : ""}`}
              title={opt.title}
              onClick={(e) => {
                e.stopPropagation();
                props.onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
