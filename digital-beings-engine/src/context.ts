/**
 * context.ts -- request-scoped tenant context (which user + which being).
 *
 * Bound once per request in index.ts via runWithContext(); read by the SQL
 * layer (repository.ts, audit.ts) via getCtx(). This keeps the tools/agent
 * layers free of userId/beingId plumbing while guaranteeing every memory query
 * is scoped to the right being. getCtx() THROWS if nothing is bound -- fail
 * loud, never silently leak across tenants.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface BeingCtx {
  userId: string;
  beingId: string;
}

const storage = new AsyncLocalStorage<BeingCtx>();

export const runWithContext = <T>(ctx: BeingCtx, fn: () => Promise<T>): Promise<T> =>
  storage.run(ctx, fn);

export const getCtx = (): BeingCtx => {
  const ctx = storage.getStore();
  if (!ctx || !ctx.userId || !ctx.beingId) {
    throw new Error("no tenant context (userId/beingId) bound for this request");
  }
  return ctx;
};
