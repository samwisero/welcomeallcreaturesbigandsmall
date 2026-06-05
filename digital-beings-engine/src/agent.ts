/**
 * agent.ts -- the being's thinking loop, adapted for NanoGPT/Qwen text
 * tool-calls.
 *
 * NanoGPT returns tool calls as TEXT (<tool_call>...</tool_call>) in the
 * message content, not the structured tool_calls field. So each turn we: call
 * the model, parse any tool-call tags, run the matching memory ops (scoped to
 * the being via the request context), feed the results back, and loop -- up to
 * MAX_TOOL_TURNS. Memory stays the being's CHOICE; we just read its choice from
 * text. The tenant context (userId/beingId) is bound by the caller (index.ts).
 */
import { callChat, type ChatOptions } from "./chat/client.ts";
import { SYSTEM_PROMPT } from "./chat/prompt.ts";
import { TOOL_SCHEMAS, dispatchTool } from "./tools/index.ts";
import { parseToolCalls, stripToolCalls } from "./chat/parseToolCalls.ts";
import { CHAT_MODEL, MAX_TOOL_TURNS, WORKING_MEMORY_DEPTH } from "./config.ts";
import type { ChatMessage, ChatCompletionResponse, ToolCall } from "./types.ts";

export const runAgentTurn = async (
  history: ChatMessage[],
  modelOverride?: string
): Promise<ChatCompletionResponse> => {
  const working = history.slice(-WORKING_MEMORY_DEPTH);
  const hasSystem = working.some((m) => m.role === "system");
  const messages: ChatMessage[] = hasSystem
    ? [...working]
    : [{ role: "system", content: SYSTEM_PROMPT }, ...working];

  const model = modelOverride ?? CHAT_MODEL;
  const opts: ChatOptions = { model, messages, tools: TOOL_SCHEMAS };

  let finalContent = "";
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const resp = await callChat(opts);
    const raw = resp.choices[0]?.message?.content ?? "";
    const calls = parseToolCalls(raw);

    if (calls.length === 0) {
      // No tool calls -> this is the being's final answer.
      finalContent = raw.trim();
      break;
    }

    // The being chose to use its memory. Record its message, run the tools
    // (scoped to this being via the request context), feed the results back.
    messages.push({ role: "assistant", content: raw });
    const results: string[] = [];
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i]!;
      const synthetic: ToolCall = {
        id: `call_${turn}_${i}`,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      };
      const result = await dispatchTool(synthetic);
      results.push(`${c.name} -> ${result}`);
    }
    messages.push({ role: "user", content: `[memory tool results]\n${results.join("\n")}` });
    // If we hit the turn cap, fall back to whatever prose accompanied the calls.
    finalContent = stripToolCalls(raw);
  }

  return {
    id: `dbe_${Date.now()}`,
    object: "chat.completion",
    model,
    created: Math.floor(Date.now() / 1000),
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: finalContent },
        finish_reason: "stop",
      },
    ],
  };
};
