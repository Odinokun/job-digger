import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { platformsByPage } from "./page-platform.ts";

/** The request schedule is not tested here - it has its own tests. */
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

// Sites and pages: src/server/http/testing/README.md.
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
    // Nobody listens on port 1: the request would give fetch-failed, but it never happens.
    expect(
      await platformsByPage(
        ["https://jobs.lever.co/acme", "not an address at all"],
        client("http://127.0.0.1:1"),
      ),
    ).toEqual(new Map());
  });
});
