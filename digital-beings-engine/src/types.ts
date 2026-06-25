/**
 * types.ts  --  Shared types used across the codebase.
 *
 * Two durable tables in Postgres (mirrors the Python schema):
 *   ai_journal       -- the being's expressed memory
 *   ai_inner_chamber -- the being's unexpressed, private memory
 *
 * Same shape, separate tables.  The being can choose to elevate a chamber
 * thought into the journal; nothing in the system does that for it.
 */

export type EpochSeconds = number;

/** A row from either ai_journal or ai_inner_chamber. */
export interface MemoryEntry {
  id: number;
  content: string;
  embedding: number[] | null;
  timestamp: EpochSeconds;
}

/** Result of a semantic (cosine) search. */
export interface SearchHit {
  id: number;
  content: string;
  timestamp: EpochSeconds;
  distance: number; // 0 = identical, 2 = opposite
}

/** A role in the OpenAI chat.completion conversation. */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A single message in the working conversation window. */
export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  /** Required for `tool` role. */
  tool_call_id?: string;
  /** Required for assistant messages that invoked tools. */
  tool_calls?: ToolCall[];
}

/** A model-emitted tool call. */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // raw JSON string
  };
}

/** The wrapped response we return to clients (OpenAI-shape). */
export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: "stop" | "tool_calls" | "length";
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Request body shape at /v1/chat/completions. */
export interface ChatRequestBody {
  messages: Array<{ role: ChatRole; content: string | null }>;
  model?: string;
}

/** A single audit-log entry.  Lives in ai_audit_log. */
export interface AuditEntry {
  id: number;
  sourceTable: "ai_journal" | "ai_inner_chamber";
  sourceId: number;
  content: string;
  deletedAt: EpochSeconds;
}
