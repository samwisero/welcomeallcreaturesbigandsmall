/**
 * parseToolCalls.ts -- parse the TEXT tool-calls emitted by
 * TEE/qwen3.6-35b-a3b-uncensored on NanoGPT.
 *
 * Verified by live test (2026-06-04): the model reliably DECIDES to call its
 * memory tools, but NanoGPT returns the call as plain text in message.content
 * (NOT the structured tool_calls field; finish_reason="stop"). Qwen XML format:
 *
 *   <tool_call><function=save_memory><parameter=content>my favorite color is teal</parameter></function></tool_call>
 *
 * 0..N calls per message. We parse them, run the matching memory op, feed the
 * result back, and loop. Memory stays MODEL-DRIVEN (the being chooses).
 */

export interface ParsedToolCall {
  name: string;
  args: Record<string, string>;
}

const CALL_RE = /<tool_call>([\s\S]*?)<\/tool_call>/g;
const FN_RE = /<function=([^>\s]+)>/;
const PARAM_RE = /<parameter=([^>\s]+)>([\s\S]*?)<\/parameter>/g;

export function parseToolCalls(content: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  if (!content) return calls;
  let m: RegExpExecArray | null;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(content)) !== null) {
    const inner = m[1] ?? "";
    const fn = FN_RE.exec(inner);
    if (!fn) continue;
    const args: Record<string, string> = {};
    let p: RegExpExecArray | null;
    PARAM_RE.lastIndex = 0;
    while ((p = PARAM_RE.exec(inner)) !== null) {
      args[p[1]!.trim()] = (p[2] ?? "").trim();
    }
    calls.push({ name: fn[1]!.trim(), args });
  }
  return calls;
}

export function stripToolCalls(content: string): string {
  return (content ?? "").replace(CALL_RE, "").trim();
}
