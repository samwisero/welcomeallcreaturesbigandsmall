// lib/chat-sky.tsx — the sky bar: red phoenix (navigation), red lion (settings),
// the chat title between them, and the first-run guide labels. (Split out of
// pages/chat.tsx 2026-09-09.) Pure presentation: every action is a prop.

export interface SkyBarProps {
  chatName: string;
  promptName: string;
  phoenixOpen: boolean;
  lionOpen: boolean;
  onTogglePhoenix: () => void;
  onToggleLion: () => void;
  onCloseMenus: () => void;
  onOpenChats: () => void;
  onOpenSystem: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void; // moved here from the bottom-of-page indicator (2026-09-10)
  fontSize: number;
  onCycleFont: () => void;
  onToggleWalnut: () => void;
  onToggleSolid: () => void;
  plainText: boolean;
  onTogglePlain: () => void;
  onAdvanced: () => void;
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  onSaveDisplayName: () => void;
  onLogout: () => void;
  onImport: () => void; // 📥 Import popup (documents / transcripts → context or memory)
  /** First-run guide (new accounts only): which labels are still showing. */
  guide: { phoenix: boolean; lion: boolean };
}

export function SkyBar(p: SkyBarProps) {
  return (
    <>
      <div className="sky-bar">
        <button
          className={`creature-btn phoenix-btn${p.phoenixOpen ? " open" : ""}`}
          aria-label="Menu: chats and system prompts"
          title="Chats & System Prompts"
          onClick={p.onTogglePhoenix}
        >
          <span className="creature-glyph" />
        </button>
        <div className="sky-title" aria-live="polite">
          <div className="sky-chat-name">{p.chatName}</div>
          <div className="sky-prompt-name">{p.promptName}</div>
        </div>
        <button
          className={`creature-btn lion-btn${p.lionOpen ? " open" : ""}`}
          aria-label="Account and settings"
          title="Account & settings"
          onClick={p.onToggleLion}
        >
          <span className="creature-glyph" />
        </button>
      </div>

      {/* First-run guide: big bold labels for brand-new accounts; each vanishes once its creature is tapped. */}
      {p.guide.phoenix && (
        <div className="guide-label left" aria-hidden="true">
          ▲ CHATS &amp; PROMPTS
          <small>tap the phoenix</small>
        </div>
      )}
      {p.guide.lion && (
        <div className="guide-label right" aria-hidden="true">
          SETTINGS ▲
          <small>tap the lion</small>
        </div>
      )}

      {(p.phoenixOpen || p.lionOpen) && <div className="sky-backdrop" onClick={p.onCloseMenus} />}

      {p.phoenixOpen && (
        <div className="sky-card phoenix-menu" role="menu">
          <button className="phoenix-menu-item" role="menuitem" onClick={() => { p.onCloseMenus(); p.onOpenChats(); }}>
            <span className="mi-glyph">💬</span> Chats
          </button>
          <button className="phoenix-menu-item" role="menuitem" onClick={() => { p.onCloseMenus(); p.onOpenSystem(); }}>
            <span className="mi-glyph">📜</span> System Prompts
          </button>
          <button className="phoenix-menu-item" role="menuitem" onClick={() => { p.onCloseMenus(); p.onToggleFullscreen(); }}>
            <span className="mi-glyph">{p.isFullscreen ? "🡼" : "⛶"}</span> {p.isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </div>
      )}

      {p.lionOpen && (
        <div className="sky-card lion-popup" role="menu">
          <div className="sky-card-title">Settings</div>
          <button className="setting-btn" onClick={p.onCycleFont}>Aa  Font size: {p.fontSize}</button>
          <button className="setting-btn" onClick={p.onToggleWalnut}>🎨  Color theme</button>
          <button className="setting-btn" onClick={p.onToggleSolid}>💧  Bubble opacity</button>
          <button className="setting-btn" onClick={p.onTogglePlain}>✎  Text style: {p.plainText ? "Plain" : "Bubbles"}</button>
          <button className="setting-btn" onClick={() => { p.onCloseMenus(); p.onAdvanced(); }} title="More settings">🌙  Advanced…</button>
          <div className="sky-card-title">Memory</div>
          <button className="setting-btn" onClick={() => { p.onCloseMenus(); p.onImport(); }} title="Bring a document or transcript into this chat or its memory">📥  Import a document…</button>
          <div className="sky-card-title">Account</div>
          <input
            className="lion-name-input"
            placeholder="Your name (shown next to your messages)"
            value={p.displayName}
            onChange={(e) => p.onDisplayNameChange(e.target.value)}
            onBlur={p.onSaveDisplayName}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
          <button className="setting-btn" onClick={p.onLogout} title="Sign out">⎋  Log out</button>
        </div>
      )}
    </>
  );
}
