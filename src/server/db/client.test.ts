import { afterEach, describe, expect, it, vi } from "vitest";

/** The pool cache lives on `globalThis` - every test starts without it. */
function forgetCachedDb() {
  const store = globalThis as Record<string, unknown>;
  delete store.jobDiggerPool;
  delete store.jobDiggerDb;
}

afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedDb();
});

describe("getDb", () => {
  it("returns one database and one pool for the whole production process", async () => {
    // The pool opens nothing until there is a query, so no real database is needed.
    forgetCachedDb();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@127.0.0.1:1/none");
    const { getDb } = await import("./client.ts");

    const first = getDb();
    const second = getDb();

    // A new pool on every call meant new connections on every page request, and
    // `next start` hit the PostgreSQL limit (task 3.23).
    expect(second).toBe(first);
    expect(second.$client).toBe(first.$client);
  });
});
