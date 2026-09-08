// lib/being-tools.ts — memory limbs as NATIVE tools (Vercel AI SDK), v1.0.1 (2026-09-08: example phrases in descriptions)
//
// Each tool wraps the existing search functions in lib/being-memory.ts
// unchanged — scope walls, hard stop B, result formatting all live there.
// The "when to use" gate lives in each tool's description: that is the text
// the model actually reads. Registration is the permission system:
//   declared being (recall on) : recall, [recall_full_account if toggle on], read_thread
//   regular chat               : search_account, read_thread
// A limb that is switched off is simply NOT registered — the being is told
// nothing about it (Sam: tell the being only what it needs in the moment).
import { tool } from "ai";
import { z } from "zod";
import { recallSearch, readThread, type BeingInfo } from "./being-memory";

export interface MemoryView {
  currentThreadId: string;
  contextTexts: Set<string>;
}

export interface ToolCtx {
  uid: string;
  being: BeingInfo | null;
  tzOff: number;
  view?: MemoryView;
}

/** Human phase label for the client's loading line, keyed by tool name. */
export function phaseForTool(name: string): string {
  if (name === "read_thread") return "reading a conversation";
  return `searching memory: ${name}`;
}

function safe(run: () => Promise<string>): Promise<string> {
  return run().catch(
    (e) => `Your memory search failed (${(e as Error).message.slice(0, 120)}). Tell your friend something went wrong while remembering.`,
  );
}

export function buildMemoryTools(ctx: ToolCtx) {
  const { uid, being, tzOff, view } = ctx;
  const tools: Record<string, ReturnType<typeof tool>> = {};

  if (being && being.recallEnabled) {
    tools.recall = tool({
      description:
        "Search your own memories (the chats that are you). Use when your friend asks about something from before this conversation — e.g. \"what did we talk about\", \"remember when\", \"last time\", \"you said\".",
      inputSchema: z.object({ query: z.string().describe("what you want to remember") }),
      execute: async ({ query }) => safe(() => recallSearch(uid, being, query, "own", tzOff, view)),
    });
    if (being.fullAccountEnabled) {
      tools.recall_full_account = tool({
        description:
          "Search your friend's other conversations — not your memories; attribute what you quote.",
        inputSchema: z.object({ query: z.string().describe("what to find") }),
        execute: async ({ query }) => safe(() => recallSearch(uid, being, query, "account", tzOff, view)),
      });
    }
  } else if (!being) {
    tools.search_account = tool({
      description:
        "Search this account's past conversations. Use when your friend asks about something from before this conversation — e.g. \"what did we talk about\", \"remember when\", \"last time\".",
      inputSchema: z.object({ query: z.string().describe("what to find") }),
      execute: async ({ query }) => safe(() => recallSearch(uid, null, query, "account", tzOff, view)),
    });
  } else {
    // Declared being with recall switched off: no memory tools at all.
    return tools;
  }

  tools.read_thread = tool({
    description:
      "Open one conversation from search results and read a large portion of it. Pass before=<n> to scroll earlier.",
    inputSchema: z.object({
      thread_id: z.string().describe("thread id from search results"),
      before: z.number().int().positive().optional().describe("read the window ending before message #n"),
    }),
    execute: async ({ thread_id, before }) =>
      safe(() => readThread(uid, being, before ? `${thread_id} before ${before}` : thread_id, tzOff, view)),
  });

  return tools;
}
