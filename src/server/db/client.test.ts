import { afterEach, describe, expect, it, vi } from "vitest";

/** Кеш пулу живе на `globalThis` - кожен тест починає без нього. */
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
    // Пул нічого не відкриває, доки немає запиту, тож справжня база не потрібна.
    forgetCachedDb();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@127.0.0.1:1/none");
    const { getDb } = await import("./client.ts");

    const first = getDb();
    const second = getDb();

    // Новий пул на кожен виклик - нові зʼєднання на кожен запит сторінки, і
    // `next start` упирався в ліміт PostgreSQL (задача 3.23).
    expect(second).toBe(first);
    expect(second.$client).toBe(first.$client);
  });
});
