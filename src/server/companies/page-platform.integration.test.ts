import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { platformsByPage } from "./page-platform.ts";

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

function client(origin = fakeWeb.origin): HttpClient {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

// Сайти й сторінки - src/server/http/testing/README.md.
describe("platformsByPage", () => {
  it("recognises PeopleForce on a company's own domain by its page", async () => {
    expect(
      await platformsByPage(
        ["peopleforce.softconstruct.com/careers"],
        client(),
      ),
    ).toEqual(
      new Map([["peopleforce.softconstruct.com/careers", "peopleforce"]]),
    );
  });

  it("leaves out a page that is not PeopleForce", async () => {
    expect(
      await platformsByPage(["https://initech.example/careers"], client()),
    ).toEqual(new Map());
  });

  it("leaves out a page that did not answer", async () => {
    expect(
      await platformsByPage(["https://initech.example/no-such-page"], client()),
    ).toEqual(new Map());
  });

  it("does not request a page whose address already names its platform", async () => {
    // Порт 1 ніхто не слухає: запит дав би fetch-failed, але його не буде.
    expect(
      await platformsByPage(
        ["https://jobs.lever.co/acme", "not an address at all"],
        client("http://127.0.0.1:1"),
      ),
    ).toEqual(new Map());
  });
});
