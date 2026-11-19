import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readBreezy } from "./breezy.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

/** Фейковий вебсервер зі справжніми збереженими відповідями. */
let fakeWeb: FakeWeb;

beforeAll(async () => {
  fakeWeb = await startFakeWeb({
    root: fileURLToPath(new URL("../http/testing/responses", import.meta.url)),
    port: 0,
  });
});

afterAll(async () => {
  await fakeWeb.close();
});

/** Клієнт, що ходить на заданий сервер замість справжніх сайтів. */
function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 100,
  });
}

describe("readBreezy", () => {
  it("reads the positions of a real board from a position link", async () => {
    const result = await readBreezy(
      "https://breezy.breezy.hr/p/98323abf2296-employee-12",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(3);
  });

  it("reports a board that does not exist", async () => {
    const result = await readBreezy(
      "https://no-such-company.breezy.hr",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Breezy board", async () => {
    const result = await readBreezy(
      "https://assets-cdn.breezy.hr/x.js",
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
