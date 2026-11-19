import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readPersonio } from "./personio.ts";

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

function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

describe("readPersonio", () => {
  it("reads the positions of a real feed from a job link", async () => {
    const result = await readPersonio(
      "https://astrafy.jobs.personio.de/job/2888194?language=en",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies.map((v) => v.url)).toEqual([
      "https://astrafy.jobs.personio.de/job/2888194",
      "https://astrafy.jobs.personio.de/job/738990",
      "https://astrafy.jobs.personio.de/job/2124624",
      "https://astrafy.jobs.personio.de/job/2180291",
    ]);
  });

  it("reports a board that does not exist", async () => {
    const result = await readPersonio(
      "https://no-such-company.jobs.personio.de",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Personio board", async () => {
    const result = await readPersonio(
      "https://www.personio.com/careers",
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
