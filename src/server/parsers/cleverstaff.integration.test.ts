import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readCleverStaff } from "./cleverstaff.ts";

/** The request schedule is not tested here - it has its own tests. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

/** The fake web server with real saved responses. */
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

/** A client that goes to the given server instead of real sites. */
function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 100,
  });
}

// The fake server ignores the query string, so for any alias it serves the
// 8allocate board, and for any vacancy the 8allocate vacancy.
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
      // Nobody listens on port 1: if a request went out, it would be fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
