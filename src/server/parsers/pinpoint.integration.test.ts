import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readPinpoint } from "./pinpoint.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

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

function client(origin = fakeWeb.origin) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

describe("readPinpoint", () => {
  it("reads the postings of a real careers page from its address", async () => {
    // Адреса, яку автор дав: кар'єрна сторінка з якорем на блок вакансій.
    const result = await readPinpoint(
      "https://gig.pinpointhq.com/#js-careers-jobs-block",
      client(),
    );

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(16);
  });

  it("reports a company that does not exist", async () => {
    expect(
      await readPinpoint("https://nobody.pinpointhq.com/", client()),
    ).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for Pinpoint's own website", async () => {
    expect(
      await readPinpoint(
        "https://www.pinpointhq.com/",
        client("http://127.0.0.1:9"),
      ),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
