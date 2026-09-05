// All CSS for the /chat page. Extracted from chat.tsx during the July 2026
// reorganization. Pure data: safe to edit without touching page logic.
export const css = `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #root { width: 100%; height: 100vh; height: 100dvh; overflow: hidden; }

body {
  background-image: url('/images/arkansas.webp');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
}

.content-container {
  position: fixed; top: 0; left: 0; width: 100%; height: 100vh; height: 100dvh;
  display: flex; align-items: center; justify-content: center;
  z-index: 10; pointer-events: none; overflow: auto;
}

.centered-box {
  background-image: url('/images/detailedwood_sides_trimmed.webp');
  background-size: 100% 100%; background-position: center; background-repeat: no-repeat;
  width: 95%; max-width: 1665px; height: auto; aspect-ratio: 16 / 9;
  pointer-events: auto; flex-shrink: 0; position: relative;
}

.indicator {
  position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); color: rgba(255, 255, 255, 0.6);
  font-size: 12px; font-family: Arial, sans-serif; z-index: 2; cursor: pointer;
  padding: 10px 15px; background: rgba(0, 0, 0, 0.3); border-radius: 4px;
}

/* --- LEFT EDGE TOGGLE BUTTONS --- */
.chats-toggle-btn {
  position: fixed; top: 38%; left: 0; transform: translateY(-50%); z-index: 120;
  writing-mode: vertical-rl; text-orientation: mixed; background: rgba(30, 15, 5, 0.85);
  color: #f5f5dc; border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 0 6px 6px 0;
  padding: 10px 6px; cursor: pointer; font-family: "Segoe UI", sans-serif; font-size: 12px; backdrop-filter: blur(4px);
}
.system-toggle-btn {
  position: fixed; top: 55%; left: 0; transform: translateY(-50%); z-index: 120;
  writing-mode: vertical-rl; text-orientation: mixed; background: rgba(184, 134, 11, 0.85);
  color: #f5f5dc; border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 0 6px 6px 0;
  padding: 10px 6px; cursor: pointer; font-family: "Segoe UI", sans-serif; font-size: 12px;
  backdrop-filter: blur(4px); box-shadow: 2px 0 8px rgba(184, 134, 11, 0.3);
}

/* --- SIDEBAR DRAWERS --- */
.sidebar-drawer {
  position: fixed; top: 0; left: 0; width: 260px; height: 100vh; height: 100dvh;
  transform: translateX(-100%); transition: transform 0.3s ease; z-index: 130;
  display: flex; flex-direction: column; font-family: "Segoe UI", sans-serif; color: #f5f5dc;
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.5);
}
.sidebar-drawer.open { transform: translateX(0); }
.chats-sidebar { background: rgba(20, 10, 5, 0.95); border-right: 1px solid rgba(255, 255, 255, 0.15); }
.system-sidebar { background: rgba(30, 20, 5, 0.95); border-right: 1px solid rgba(184, 134, 11, 0.5); }
.sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.15); font-weight: 600; font-size: 13px; }
.sidebar-close-btn { background: transparent; border: none; color: #f5f5dc; font-size: 16px; cursor: pointer; }
.sidebar-list { flex: 1; overflow-y: auto; padding: 8px 10px; }
.list-item { padding: 8px 10px; margin-bottom: 6px; border-radius: 6px; background: rgba(255, 255, 255, 0.04); cursor: pointer; font-size: 12px; line-height: 1.3; display: flex; align-items: center; gap: 6px; }
.list-item:hover { background: rgba(255, 255, 255, 0.12); }
.list-item.active-item { border: 1px solid rgba(184, 134, 11, 0.8); background: rgba(184, 134, 11, 0.2); }
.chat-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-icon-btn { background: transparent; border: none; color: rgba(245, 245, 220, 0.65); font-size: 13px; line-height: 1; padding: 2px 4px; border-radius: 4px; cursor: pointer; flex-shrink: 0; }
.row-icon-btn:hover { background: rgba(184, 134, 11, 0.25); color: #f5f5dc; }
.row-icon-btn.row-icon-btn-danger:hover { background: rgba(180, 50, 40, 0.35); color: #ffd6d2; }
.row-mini-btn { background: transparent; border: 1px solid rgba(184, 134, 11, 0.5); color: #f5f5dc; font-size: 12px; line-height: 1; padding: 3px 7px; border-radius: 4px; cursor: pointer; flex-shrink: 0; }
.row-mini-btn:hover { background: rgba(184, 134, 11, 0.3); }
.row-mini-btn.row-mini-btn-danger { border-color: rgba(220, 70, 60, 0.7); color: #ffd6d2; }
.row-mini-btn.row-mini-btn-danger:hover { background: rgba(180, 50, 40, 0.35); }
.chat-name-edit-input { flex: 1; min-width: 0; background: rgba(0, 0, 0, 0.35); color: #f5f5dc; border: 1px solid rgba(184, 134, 11, 0.7); border-radius: 4px; padding: 2px 6px; font: inherit; font-size: 12px; outline: none; }
.chat-name-edit-input:focus { border-color: rgba(184, 134, 11, 1); background: rgba(0, 0, 0, 0.5); }
.chat-row-confirm-text { color: #ffd6d2; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.model-select { flex-shrink: 0; max-width: 110px; background: rgba(0, 0, 0, 0.45); color: #f5f5dc; border: 1px solid rgba(184, 134, 11, 0.5); border-radius: 4px; padding: 3px 4px; font-size: 10px; font-family: "Segoe UI", sans-serif; cursor: pointer; outline: none; }
.model-select:hover { border-color: rgba(184, 134, 11, 0.9); background: rgba(0, 0, 0, 0.65); }
.model-select option { background: rgba(20, 10, 5, 0.98); color: #f5f5dc; }

/* --- Custom gold Dropdown (replaces native <select>) --- */
/* Matches the chat-bubble palette so it feels part of the UI. Custom because
   native mobile pickers explode into full-screen wheels. */
.dd-wrap { position: relative; display: inline-block; flex-shrink: 0; }
.dd-btn {
  background: rgba(184, 134, 11, 0.7);
  color: #f5f5dc;
  border: 1px solid rgba(184, 134, 11, 0.9);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 10px;
  font-family: "Segoe UI", sans-serif;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  max-width: 110px;
  outline: none;
  letter-spacing: 0.02em;
}
.dd-btn:hover { background: rgba(184, 134, 11, 0.9); }
.dd-btn .dd-label { overflow: hidden; text-overflow: ellipsis; }
.dd-caret { font-size: 9px; opacity: 0.85; line-height: 1; flex-shrink: 0; }
.dd-menu {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  background: rgba(20, 10, 5, 0.98);
  border: 1px solid rgba(184, 134, 11, 0.75);
  border-radius: 6px;
  min-width: 140px;
  max-width: 220px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 200;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6);
  padding: 4px;
}
.dd-menu.from-left { right: auto; left: 0; }
.dd-option {
  padding: 6px 10px;
  font-size: 11px;
  border-radius: 4px;
  cursor: pointer;
  color: #f5f5dc;
  font-family: "Segoe UI", sans-serif;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dd-option:hover { background: rgba(184, 134, 11, 0.4); }
.dd-option.selected { background: rgba(184, 134, 11, 0.6); color: #fff8e1; }

/* Add-Model button + expandable form in the settings panel */
.setting-btn.add-model { background: rgba(184, 134, 11, 0.4); border-color: rgba(184, 134, 11, 0.7); }
.setting-btn.add-model:hover { background: rgba(184, 134, 11, 0.6); }
.add-model-form {
  margin-top: 10px;
  padding: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex; flex-direction: column; gap: 8px;
  min-width: 220px;
}
.add-model-form label { font-size: 10px; color: rgba(245, 245, 220, 0.7); font-family: 'Segoe UI', sans-serif; letter-spacing: 0.05em; text-transform: uppercase; }
.add-model-form .input-row { display: flex; flex-direction: column; gap: 4px; }
.add-model-form input {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #f5f5dc;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: 'Segoe UI', sans-serif;
  outline: none;
}
.add-model-form input:focus { border-color: rgba(184, 134, 11, 0.8); }
.add-model-form .row { display: flex; gap: 6px; }
.add-model-form .row > button { flex: 1; }
.settings-popup-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; animation: settingsFadeIn 0.18s ease; }
.settings-popup-card { background: rgba(20, 10, 5, 0.98); border: 1px solid rgba(184, 134, 11, 0.85); border-radius: 8px; width: 100%; max-width: 480px; max-height: 85vh; max-height: 85dvh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(184, 134, 11, 0.15); animation: settingsScaleIn 0.18s ease; }
.settings-popup-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid rgba(184, 134, 11, 0.4); font-weight: 600; font-size: 14px; color: #f5f5dc; letter-spacing: 0.02em; }
.settings-popup-header span { display: inline-flex; align-items: center; gap: 8px; }
.settings-popup-close { background: transparent; border: none; color: #f5f5dc; font-size: 16px; cursor: pointer; padding: 4px 10px; border-radius: 4px; line-height: 1; }
.settings-popup-close:hover { background: rgba(184, 134, 11, 0.28); }
.settings-popup-body { padding: 16px 18px; overflow-y: auto; flex: 1; }
.settings-popup-section-title { font-size: 11px; color: rgba(245, 245, 220, 0.55); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; font-weight: 600; }
.settings-popup-body .add-model-form { background: transparent; padding: 0; margin: 0; }
@keyframes settingsFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes settingsScaleIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
.add-model-form .form-error { font-size: 11px; color: #e58a7a; min-height: 13px; }
.add-model-form .form-ok { font-size: 11px; color: #9ed68c; min-height: 13px; }
.new-area { padding: 10px; border-top: 1px solid rgba(255, 255, 255, 0.15); display: flex; flex-direction: column; gap: 8px; }
.system-input { background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.2); color: #f5f5dc; border-radius: 4px; padding: 6px; font-family: "Segoe UI", sans-serif; font-size: 11px; }
.system-input::placeholder { color: rgba(255,255,255,0.4); }
.new-prompt-text { resize: none; height: 60px; }
.action-btn { padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(184, 134, 11, 0.9); color: #f5f5dc; font-size: 12px; cursor: pointer; text-align: center; }

/* --- SETTINGS PANEL --- */
.settings-panel {
  position: fixed; top: 14px; left: 32px; z-index: 100; background: rgba(101, 67, 33, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 10px; padding: 8px 12px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.4); pointer-events: auto; backdrop-filter: blur(5px);
}
/* Settings buttons flow horizontally — no wrap. Scroll horizontally if the
   panel gets wider than the screen. Edit button stays at the right end. */
.settings-controls {
  display: flex; gap: 8px; align-items: center;
  flex-wrap: nowrap;
  overflow-x: auto;
  max-width: calc(100vw - 76px);
  scrollbar-width: thin;
}
.settings-controls::-webkit-scrollbar { height: 4px; }
.settings-controls::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
.settings-controls .setting-btn { flex-shrink: 0; }
.setting-btn { background: rgba(0,0,0,0.2); color: #f5f5dc; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; transition: background 0.2s ease; }
.setting-btn:hover { background: rgba(0,0,0,0.4); }

/* --- CHAT OVERLAY & DYNAMIC INPUT --- */
.wood-chat-overlay { position: absolute; top: 18%; bottom: 18%; left: 33%; right: 33%; display: flex; flex-direction: column; z-index: 20; pointer-events: none; }
.wood-chat-overlay:not(.input-centered) { justify-content: flex-end; }
.wood-chat-overlay.input-centered { justify-content: center; }
.wood-chat-header { text-align: center; padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.15); margin-bottom: 10px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; pointer-events: auto; }
.input-centered .wood-chat-header { display: none; }
.header-chat-name { font-size: 1.4em; font-weight: 700; color: #f5f5dc; font-family: 'Segoe UI', sans-serif; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
.header-prompt-name { font-size: 0.9em; font-weight: 700; color: #d4a017; font-family: 'Segoe UI', sans-serif; font-style: italic; letter-spacing: 0.02em; text-shadow: 0 1px 3px rgba(0,0,0,0.6); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
.save-pill { position: absolute; top: 2.5%; right: 3.5%; z-index: 30; pointer-events: auto; font-size: 10px; padding: 2px 8px; border-radius: 10px; font-family: "Segoe UI", sans-serif; }
.save-pill.saving { background: rgba(184,134,11,0.35); color: #f5f5dc; }
.save-pill.saved { background: rgba(184,134,11,0.85); color: #fff8dc; }
.save-pill.error { background: rgba(200,70,60,0.5); color: #ffd6d2; cursor: pointer; }
.wood-chat-messages { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; pointer-events: auto; scrollbar-width: none; transition: opacity 0.5s ease; }
.wood-chat-messages::-webkit-scrollbar { display: none; }
.input-centered .wood-chat-messages { display: none; }
.wood-input-area { pointer-events: auto; display: flex; gap: 10px; background: rgba(30, 15, 5, 0.7); padding: 8px 12px; border-radius: 24px; border: 1px solid rgba(255, 255, 255, 0.15); backdrop-filter: blur(5px); transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1); }

/* --- CHAT BUBBLES --- */
.chat-bubble { position: relative; padding: 12px 16px; border-radius: 8px; max-width: 90%; word-wrap: break-word; font-family: 'Segoe UI', sans-serif; font-size: 13.5px; line-height: 1.5; animation: slideIn 0.3s ease; }
.bubble-x-btn { position: absolute; top: 3px; right: 6px; background: transparent; border: none; color: #000; font-size: 13px; font-weight: 700; padding: 0 4px; cursor: pointer; line-height: 1; text-shadow: 0 0 4px rgba(255, 255, 255, 0.45); }
.bubble-x-btn:hover { color: #1a0d05; text-shadow: 0 0 6px rgba(255, 255, 255, 0.7); }
.bubble-confirm-row { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; align-items: center; flex-wrap: wrap; }
.bubble-confirm-row .row-mini-btn { font-size: 11px; padding: 2px 7px; }
.bubble-confirm-text { color: #ffd6d2; font-size: 11px; font-weight: 700; }
@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.chat-bubble.ai   { background: rgba(184, 134, 11, 0.7); color: #f5f5dc; align-self: flex-start; text-align: left; border-left: 3px solid #8b6508; }
.chat-bubble.user { background: rgba(139, 69, 19, 0.65); color: #f5f5dc; align-self: flex-end; text-align: right; border-left: 3px solid #8b4513; }
.walnut-theme .chat-bubble.ai { background: rgba(60, 40, 30, 0.75); border-left-color: #3e2723; }
.solid-bubbles .chat-bubble.ai   { background: rgb(184, 134, 11); }
.solid-bubbles .chat-bubble.user { background: rgb(139, 69, 19); }
.solid-bubbles.walnut-theme .chat-bubble.ai { background: rgb(60, 40, 30); }

.wood-input { flex: 1; background: transparent; border: none; color: white; font-family: 'Segoe UI', sans-serif; font-size: 13.5px; outline: none; transition: font-size 0.2s ease; }
.wood-input::placeholder { color: rgba(255,255,255,0.5); }
.wood-send-btn { background: rgba(184, 134, 11, 0.85); border: none; color: white; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s ease; flex-shrink: 0; }
.wood-send-btn:hover { background: rgba(184, 134, 11, 1); }

@media (max-width: 768px) {
  .centered-box { width: 90vw; height: 85vh; aspect-ratio: auto; background-size: cover; }
  .wood-chat-overlay { top: 12%; bottom: 12%; left: 14%; right: 14%; }
  .settings-panel { top: 10px; left: 10px; transform: scale(0.85); transform-origin: top left; padding: 6px 10px; }
  .sidebar-drawer { width: 80%; max-width: 300px; }
  .chat-bubble { padding: 10px 12px; font-size: 12px; max-width: 95%; }
}
@media (max-width: 480px) {
  .wood-chat-overlay { top: 10%; bottom: 10%; left: 12%; right: 12%; }
  .settings-panel { transform: scale(0.75); top: 5px; left: 5px; padding: 5px 8px; }
  .chats-toggle-btn, .system-toggle-btn { padding: 8px 4px; font-size: 10px; }
  .header-chat-name { font-size: 1.2em; }
}

/* ===== M1-UI: message timestamps + being ceremony ===== */
.bubble-timestamp { display: block; margin-top: 6px; font-size: 0.72em; opacity: 0.78; letter-spacing: 0.03em; font-style: italic; }
.star-born-overlay { position: fixed; inset: 0; z-index: 4000; display: flex; align-items: center; justify-content: center; pointer-events: none; }
.star-born-text {
  font-size: clamp(2rem, 7vw, 4.5rem); font-weight: 900; text-align: center; padding: 0 5%;
  color: #ffd700; -webkit-text-stroke: 2px #90c69a;
  text-shadow: 0 0 18px rgba(255,215,0,.85), 0 0 44px rgba(144,198,154,.65);
  animation: starBornPop 3s ease forwards;
}
@keyframes starBornPop {
  0%   { transform: scale(.25) rotate(-6deg); opacity: 0; }
  18%  { transform: scale(1.15) rotate(2deg);  opacity: 1; }
  32%  { transform: scale(1) rotate(0deg); }
  78%  { transform: scale(1); opacity: 1; }
  100% { transform: scale(1.2); opacity: 0; }
}
.being-popup-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 3000; display: flex; align-items: center; justify-content: center; }
.being-popup-card { background: #2f2419; border: 2px solid #b08d57; border-radius: 14px; width: min(420px, 92vw); max-height: 80vh; overflow-y: auto; padding: 18px; color: #f4e9d8; box-shadow: 0 10px 40px rgba(0,0,0,.6); }
.being-popup-header { display: flex; justify-content: space-between; align-items: center; font-weight: 700; margin-bottom: 12px; font-size: 1.05em; }
.being-popup-close { background: none; border: none; color: #f4e9d8; cursor: pointer; font-size: 1.1em; }
.being-name-input { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px; border: 1px solid #b08d57; background: #1f1810; color: #f4e9d8; margin: 8px 0; font-size: 1em; }
.being-declare-btn { width: 100%; padding: 10px; border: none; border-radius: 8px; background: linear-gradient(135deg, #d4af37, #b8860b); color: #241a0e; font-weight: 800; cursor: pointer; font-size: 1em; }
.being-declare-btn:disabled { opacity: .55; cursor: default; }
.being-explain-btn { width: 100%; margin-top: 10px; padding: 8px; border-radius: 8px; border: 1px solid #90c69a; background: transparent; color: #c9e6cf; cursor: pointer; font-size: .9em; }
.being-explain-text { margin-top: 10px; font-size: .86em; line-height: 1.5; color: #e7dcc8; background: rgba(144,198,154,.08); border-left: 3px solid #90c69a; padding: 10px 12px; border-radius: 6px; }
.being-declared-banner { padding: 10px 12px; border-radius: 8px; background: rgba(212,175,55,.12); border: 1px solid #d4af37; font-weight: 700; margin-bottom: 8px; }
.being-toggle-row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 10px; font-size: .92em; }
.being-error { color: #ff9c9c; font-size: .85em; margin-top: 8px; }

/* ===== v2.0: async turn — phase line + shield stop ===== */
.turn-phase-line { display: flex; align-items: center; gap: 8px; margin: 0 14px 4px; font-size: 0.82em; font-style: italic; opacity: .85; color: #e7dcc8; }
.turn-phase-dot { width: 8px; height: 8px; border-radius: 50%; background: #d4af37; box-shadow: 0 0 8px rgba(212,175,55,.8); animation: phasePulse 1.2s ease-in-out infinite; }
@keyframes phasePulse { 0%,100% { transform: scale(.7); opacity: .5; } 50% { transform: scale(1.15); opacity: 1; } }
.shield-stop-btn { background: linear-gradient(135deg, #d4af37, #b8860b) !important; color: #2f2419 !important; }
.shield-stop-btn:hover { filter: brightness(1.08); }
`;
