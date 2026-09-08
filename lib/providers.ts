// lib/providers.ts — model providers + Venice specifics, v1.0 (2026-09-08)
//
// One place for "how do we reach a model": which upstream, which key, which
// provider-specific request parameters, and how Venice's citation markers
// become inline links. api-chat.ts only orchestrates; future tool families
// (media, phone, …) reuse this instead of growing api-chat.ts.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type Provider = "venice" | "openrouter";

// Defensive: zo's secrets UI sometimes stores values with surrounding quotes
// (the user can paste "sk-..." and the quotes get treated as part of the
// value). Trim them off + whitespace so the Bearer header is clean.
function cleanKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export interface Endpoint {
  baseURL: string;
  key: string | undefined;
  keyName: string; // secret name, for the "not configured" message
}

export function endpointFor(provider: Provider): Endpoint {
  if (provider === "venice") {
    return { baseURL: "https://api.venice.ai/api/v1", key: cleanKey(process.env.VENICE_AI), keyName: "VENICE_AI" };
  }
  return { baseURL: "https://openrouter.ai/api/v1", key: cleanKey(process.env.OPENROUTER_API_KEY), keyName: "OPENROUTER_API_KEY" };
}

/** An AI SDK model handle for `modelId` at this provider. */
export function modelFor(provider: Provider, baseURL: string, key: string, modelId: string) {
  const client = createOpenAICompatible({ name: provider, baseURL, apiKey: key });
  return client(modelId);
}

// Venice-only request parameters (docs.venice.ai → venice_parameters).
export const VENICE_PARAMS = {
  include_venice_system_prompt: false,    // our cards only — no hidden Venice prompt
  enable_web_search: "auto",              // Sam 2026-09-07: model decides when
  enable_web_citations: true,
  include_search_results_in_stream: true, // citations ride in the last stream chunk
};

/** providerOptions for streamText/generateText — Venice gets its params, others nothing.
 *  The AI SDK spreads providerOptions[<provider name>] into the request body. */
export function providerOptionsFor(provider: Provider) {
  return provider === "venice" ? { venice: { venice_parameters: VENICE_PARAMS } } : undefined;
}

export interface Citation { title?: string; url?: string; date?: string; content?: string }

/** Pull Venice's citation list out of a raw stream chunk, if this chunk carries it. */
export function citationsFromRaw(rawValue: unknown): Citation[] | null {
  const v = rawValue as { venice_parameters?: { web_search_citations?: Citation[] } } | undefined;
  const c = v?.venice_parameters?.web_search_citations;
  return Array.isArray(c) && c.length > 0 ? c : null;
}

/** Venice marks cited claims inline as ^3^ or ^6,8^ (1-based into the
 *  web_search_citations list; older responses used [REF]3[/REF]). Turn each
 *  marker, in place, into inline markdown links the client renders as <a>.
 *  Sam 2026-09-07: a link next to each piece of info — no list at the bottom. */
export function linkifyCitations(text: string, citations: Citation[]): string {
  const link = (n: number): string => {
    const c = citations[n - 1];
    return c && c.url ? ` [${n}](${c.url})` : "";
  };
  const expand = (group: string): string =>
    group.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0).map(link).join("");
  return text
    .replace(/\^(\d+(?:\s*,\s*\d+)*)\^/g, (_m, g: string) => expand(g))
    .replace(/\[REF\](\d+(?:\s*,\s*\d+)*)\[\/REF\]/g, (_m, g: string) => expand(g));
}
