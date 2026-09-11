// Shared between the /chat page and /api/chat. Pure types + data + math —
// no React, no browser APIs, no import.meta (must build server-side too).

export interface ChatMessage {
  id: string;
  text: string;
  type: "user" | "ai";
  ts?: number; // ms epoch, stamped at creation (M1); absent on pre-M1 messages
  speaker?: string;  // imports (2026-09-09): who said it, by name — shown in plain-text mode
  imported?: boolean; // imports: already in memory under its 📥 thread — the live mirror skips these
}

export interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  systemPromptId: string | null;
  modelId: string;
  updatedAt?: number; // ms epoch of last real change (message/rename/prompt/model)
}

export interface SystemPrompt {
  id: string;
  name: string;
  text: string;
}

export interface ModelOption {
  id: string;
  name: string;
  shortName: string;
  // Tells the backend which API to dispatch to. Required for every model,
  // including user-added custom ones from the Add Model form.
  provider: "venice" | "openrouter" | "beam";
  // Total context window in tokens; undefined -> DEFAULT_CONTEXT_WINDOW.
  contextWindow?: number;
}

// =====================================================================
// Constants
// =====================================================================

// THE one model catalog — imported by the /chat page AND /api/chat, so the
// client picker and the server registry can no longer drift apart.
// 2026-09-11: default is now our own Qwen 27B on Beam (Sam). Existing chats keep their chosen model.
export const DEFAULT_MODEL_ID = "qwen3.8-27b-uncensored";
// Fallback context window (tokens) for custom models that predate the
// context-window field, or any model missing the value.
export const DEFAULT_CONTEXT_WINDOW = 32768;
export const availableModels: ModelOption[] = [
  {
    // Our own model on Beam Cloud (2026-09-11): JonathanColetti/Qwen3.8-27B-Uncensored GGUF Q4_K_M,
    // llama.cpp on an RTX4090, vision on, thinking off. Context = the measured llama-server -c.
    id: "qwen3.8-27b-uncensored",
    name: "Qwen 3.8 27B Uncensored (Beam)",
    shortName: "Qwen 27B",
    provider: "beam",
    contextWindow: 131072, // measured 2026-09-11: 21.9 GB of 24.5 GB VRAM used at 131K with vision (llama-server -c 131072, q8_0 KV)
  },
  {
    id: "olafangensan-glm-4.7-flash-heretic:disable_thinking=true",
    name: "GLM 4.7 Flash Heretic (Venice)",
    shortName: "GLM Heretic",
    provider: "venice",
    contextWindow: 200000, // Sam confirmed — new account default 07/10/26
  },
  {
    id: "gemma-4-uncensored",
    name: "Gemma 4 Uncensored (Venice)",
    shortName: "Gemma 4",
    provider: "venice",
    contextWindow: 262144, // 256K — Sam confirmed
  },
  {
    id: "e2ee-gemma-4-26b-a4b-uncensored-p",
    name: "Gemma 4 26B A4B Uncensored (Venice)",
    shortName: "Gemma 26B",
    provider: "venice",
    contextWindow: 65536, // 64K — Sam confirmed
  },
];



// History sent upstream is now trimmed by a token budget per model's context
// window (see estimateTokens / rollingHistoryBudget / trimToTokenBudget below).
// The full history still renders + saves to the cloud; only the model payload
// is trimmed.

// Short, collision-resistant id. base36 of (epoch ms) + 4 random base36 chars.
// Used for both chat session ids and message ids — same shape, same generator.
export function generateId(): string {
  // crypto.randomUUID is universally available in modern browsers and gives
  // true uniqueness. Fallback preserved for environments where crypto isn't
  // exposed (older Safari private mode, certain test runners).
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// --- Token-aware context window trimming ---
// Replaces the old fixed MAX_HISTORY=40 cap. Estimate tokens (chars/4 — no
// tokenizer dependency) and keep as many recent turns as fit the model window.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimToTokenBudget(
  messages: ChatMessage[],
  budget: number,
): ChatMessage[] {
  if (budget <= 0) return [];
  const result: ChatMessage[] = [];
  let used = 0;
  // Walk backward from the most recent — preserves the freshest context.
  // +4 per message accounts for role/formatting overhead in the chat template.
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = estimateTokens(messages[i].text) + 4;
    if (used + cost > budget) break;
    result.unshift(messages[i]);
    used += cost;
  }
  return result;
}

// Cushion of the window reserved for future image/video tokens — chars/4 can't
// see media tokens. Blunt stopgap until real attachment-token accounting lands;
// set to 0 to disable.
export const MEDIA_HEADROOM = 0.1;

// Tokens available for prior conversation, given a model window + system prompt.
export function rollingHistoryBudget(
  contextWindow: number,
  systemPromptText: string | null,
): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return 0;
  const targetInput = Math.floor(contextWindow * 0.8);
  const outputReserve = contextWindow <= 32768 ? 2048 : 4096;
  const mediaReserve = Math.floor(contextWindow * MEDIA_HEADROOM);
  const systemTokens = systemPromptText ? estimateTokens(systemPromptText) : 0;
  return Math.max(0, targetInput - outputReserve - mediaReserve - systemTokens);
}

// =====================================================================
// Styles — kept inline so the whole page is one file, like the original
// =====================================================================
