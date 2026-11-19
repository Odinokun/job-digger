import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { findSiteAtsLinks } from "./ats-links.ts";

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

function client() {
  return createHttpClient({
    fakeOrigin: fakeWeb.origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

describe("findSiteAtsLinks", () => {
  it("finds the job board the company site links to", async () => {
    // Синтетична головна Acme (src/server/http/testing/README.md): Careers і
    // одна вакансія ведуть на ту саму дошку Lever.
    expect(await findSiteAtsLinks("https://acme.example", client())).toEqual({
      ok: true,
      boards: [{ url: "https://jobs.lever.co/leverdemo", platform: "lever" }],
    });
  });

  it("reports a site that does not answer with a page", async () => {
    expect(await findSiteAtsLinks("https://nothing.example", client())).toEqual(
      { ok: false, error: { reason: "not-found" } },
    );
  });
});
