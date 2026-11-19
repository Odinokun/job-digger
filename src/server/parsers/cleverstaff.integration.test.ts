import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readCleverStaff } from "./cleverstaff.ts";

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

// Фейковий сервер ігнорує рядок запиту, тож на будь-який аліас віддає дошку
// 8allocate, а на будь-яку вакансію - вакансію 8allocate.
describe("readCleverStaff", () => {
  it("reads the vacancies of a real board", async () => {
    const result = await readCleverStaff(
      "https://cleverstaff.net/i/8allocate-vacancies",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(8);
  });

  it("finds the board of a vacancy link and reads it", async () => {
    const result = await readCleverStaff(
      "https://cleverstaff.net/i/vacancy-3ONpJV",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(8);
  });

  it("does not request anything for an address that is not a CleverStaff board", async () => {
    const result = await readCleverStaff(
      "https://cleverstaff.net/why.html",
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
