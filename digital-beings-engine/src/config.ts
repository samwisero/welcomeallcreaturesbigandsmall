/**
 * config.ts -- all env vars + tunables in one place. Fail loud on missing.
 *
 * Chat = NanoGPT (the being's brain). Embeddings = OpenRouter (Qwen3-Embedding-8B).
 * Database = Supabase Postgres via the IPv4 Supavisor SESSION pooler (port 5432).
 */

const requireEnv = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}.`);
  return v;
};
const optionalEnv = (name: string, fallback: string): string => {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
};

// --- Chat: NanoGPT (OpenAI-compatible). Per-being model overrides CHAT_MODEL.
export const NANO_GPT_API_KEY: string = requireEnv("NANO_GPT_API_KEY");
export const NANO_GPT_BASE_URL: string = optionalEnv("NANO_GPT_BASE_URL", "https://nano-gpt.com/api/v1");
export const CHAT_MODEL: string = optionalEnv("CHAT_MODEL", "TEE/qwen3.6-35b-a3b-uncensored");

// --- Embeddings: OpenRouter (Qwen3-Embedding-8B, 4096-dim). Do not swap models.
export const OPENROUTER_API_KEY: string = requireEnv("OPENROUTER_API_KEY");
export const OPENROUTER_BASE_URL: string = "https://openrouter.ai/api/v1";
export const EMBED_MODEL: string = optionalEnv("EMBED_MODEL", "qwen/qwen3-embedding-8b");
export const EMBED_DIM: number = Number(optionalEnv("EMBED_DIM", "4096"));
export const EMBED_INPUT_CHAR_CAP: number = Number(process.env.EMBED_INPUT_CHAR_CAP ?? 8000);

// --- Database (Supabase via Supavisor session pooler, port 5432, SSL). Discrete
// fields avoid URL-encoding the password. Never use the 6543 transaction pooler
// with a persistent pool (it disables prepared statements).
export const DB_HOST: string = optionalEnv("DB_HOST", "aws-1-us-east-1.pooler.supabase.com");
export const DB_PORT: number = Number(optionalEnv("DB_PORT", "5432"));
export const DB_USER: string = optionalEnv("DB_USER", "postgres.oelfxzsaenqmmxtnhoex");
export const DB_NAME: string = optionalEnv("DB_NAME", "postgres");
export const DB_PASSWORD: string = requireEnv("DATABASE_PASS");

// --- Server tunables.
export const SERVER_PORT: number = Number(optionalEnv("DBE_PORT", "8080"));
export const WORKING_MEMORY_DEPTH: number = Number(optionalEnv("WORKING_MEM", "40"));
export const MAX_TOOL_TURNS: number = Number(optionalEnv("MAX_TOOL_TURNS", "3"));
export const MAX_BROWSE_LIMIT: number = Number(optionalEnv("MAX_BROWSE", "50"));
export const MAX_REQUEST_BODY_BYTES: number = Number(optionalEnv("MAX_BODY", String(8 * 1024 * 1024)));
export const MAX_SEARCH_RESULTS: number = Number(optionalEnv("MAX_SEARCH", "15"));
export const RATE_LIMIT_RPM: number = Number(optionalEnv("RATE_LIMIT_RPM", "60"));
