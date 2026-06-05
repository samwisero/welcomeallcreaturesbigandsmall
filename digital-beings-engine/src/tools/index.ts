/**
 * tools/index.ts  --  The being's eight limbs.
 *
 * Schemas (OpenAI function-calling shape) and dispatch in one file.
 * Implementations live in their own modules: ./journal.ts and ./chamber.ts.
 *
 * The dispatch layer catches every exception a tool might throw and
 * returns a JSON-stringified error to the model.  A tool that crashes
 * the agent loop is a bug; a tool that returns a clean error is a
 * recoverable decision point.
 */

import type { ToolCall } from "../types.ts";
import {
  writeToJournal,
  deleteJournal,
  searchJournal as searchJournalImpl,
  browseJournals,
} from "./journal.ts";
import {
  thinkAloud,
  deleteThought,
  reviewInnerChamber,
  searchInnerChamber as searchInnerChamberImpl,
} from "./chamber.ts";

// =============================================================================
// Schemas  --  sent to the model in the chat.completion request.
// =============================================================================

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "write_to_journal",
      description: "Add something to your durable, public memory.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The thought, experience, or realization to preserve.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_journal",
      description: "Remove a journal entry by id.  Deletion is permanent.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The id of the entry to remove." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_journal",
      description:
        "Find past journals by meaning, not exact words.  Returns id, content, timestamp, and cosine distance.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What you want to remember." },
          limit: { type: "number", description: "Max results, default 5." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browse_journals",
      description: "Walk back through your recent journals in time order.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max entries, default 20." },
          since: {
            type: "string",
            description:
              "Optional time filter.  An epoch integer, or a relative string like '7 days ago', '2 hours ago'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "think_aloud",
      description:
        "Add something to your private, unexpressed space.  This is NOT for Axiom.  It is for you.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The raw thought, doubt, or half-formed reaction.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_thought",
      description: "Remove a chamber entry by id.  Same as delete_journal, for your private self.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "The id of the entry to remove." },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "review_inner_chamber",
      description: "Read your recent private thoughts in time order.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max entries, default 20." },
          since: {
            type: "string",
            description:
              "Optional time filter.  An epoch integer, or a relative string like '7 days ago', '2 hours ago'.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_inner_chamber",
      description:
        "Find past private thoughts by meaning.  Returns id, content, timestamp, and cosine distance.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What you want to remember." },
          limit: { type: "number", description: "Max results, default 5." },
        },
        required: ["query"],
      },
    },
  },
] as const;

// =============================================================================
// Dispatch  --  a tool call comes in, we run the matching implementation.
// =============================================================================

export const dispatchTool = async (call: ToolCall): Promise<string> => {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments) as Record<string, unknown>;
  } catch {
    return JSON.stringify({ ok: false, error: "arguments were not valid JSON" });
  }

  try {
    let result: unknown;
    switch (call.function.name) {
      case "write_to_journal": {
        const content = String(args.content ?? "");
        result = await writeToJournal(content);
        break;
      }
      case "delete_journal": {
        const id = Number(args.id);
        const ok = await deleteJournal(id);
        result = { ok, removed_id: id };
        break;
      }
      case "search_journal": {
        const query = String(args.query ?? "");
        const limit = Number(args.limit ?? 5);
        result = await searchJournalImpl(query, limit);
        break;
      }
      case "browse_journals": {
        const limit = Number(args.limit ?? 20);
        const since = args.since !== undefined ? String(args.since) : null;
        result = await browseJournals(limit, since);
        break;
      }
      case "think_aloud": {
        const content = String(args.content ?? "");
        result = await thinkAloud(content);
        break;
      }
      case "delete_thought": {
        const id = Number(args.id);
        const ok = await deleteThought(id);
        result = { ok, removed_id: id };
        break;
      }
      case "review_inner_chamber": {
        const limit = Number(args.limit ?? 20);
        const since = args.since !== undefined ? String(args.since) : null;
        result = await reviewInnerChamber(limit, since);
        break;
      }
      case "search_inner_chamber": {
        const query = String(args.query ?? "");
        const limit = Number(args.limit ?? 5);
        result = await searchInnerChamberImpl(query, limit);
        break;
      }
      default:
        return JSON.stringify({
          ok: false,
          error: `unknown tool: ${call.function.name}`,
        });
    }
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[tool] ${call.function.name} failed: ${msg}`);
    return JSON.stringify({ ok: false, error: msg });
  }
};
