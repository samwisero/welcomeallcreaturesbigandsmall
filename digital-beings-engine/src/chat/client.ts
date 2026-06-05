/**
 * client.ts -- chat client (NanoGPT, OpenAI-compatible). Takes a conversation,
 * returns the model's next message. We do NOT execute tools here (the agent
 * loop parses the model's text tool-calls). Retries once on transient error.
 */
import OpenAI from "openai";
import { CHAT_MODEL, NANO_GPT_API_KEY, NANO_GPT_BASE_URL } from "../config.ts";
import type { ChatCompletionResponse, ChatMessage } from "../types.ts";

let _client: OpenAI | null = null;

const getClient = (): OpenAI => {
  if (_client === null) {
    _client = new OpenAI({ apiKey: NANO_GPT_API_KEY, baseURL: NANO_GPT_BASE_URL });
  }
  return _client;
};

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools: readonly unknown[];
  temperature?: number;
}

const callOnce = async (opts: ChatOptions): Promise<ChatCompletionResponse> => {
  const body: Record<string, unknown> = { model: opts.model, messages: opts.messages };
  if (opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  const resp = await getClient().chat.completions.create(body as never);
  return resp as unknown as ChatCompletionResponse;
};

export const callChat = async (opts: ChatOptions): Promise<ChatCompletionResponse> => {
  try {
    return await callOnce(opts);
  } catch (e) {
    console.warn(`[chat] first attempt failed (${(e as Error).message}); retrying once`);
    return await callOnce(opts);
  }
};

export { CHAT_MODEL };
