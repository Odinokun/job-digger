import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { discoverSources } from "./discover.ts";

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

function client(): HttpClient {
  return createHttpClient({
    fakeOrigin: fakeWeb.origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

// Сайти й дошки - src/server/http/testing/README.md.
describe("discoverSources", () => {
  it("finds the board the site links to and reads it", async () => {
    expect(
      await discoverSources(
        { siteUrl: "https://acme.example", name: "Acme" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://jobs.lever.co/leverdemo",
        platform: "lever",
        via: "site",
        vacancies: 10,
      },
    ]);
  });

  it("reports an own career page as unreadable", async () => {
    expect(
      await discoverSources(
        { siteUrl: "https://initech.example", name: "Initech" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://initech.example/careers",
        platform: "unsupported",
        via: "site",
        vacancies: null,
      },
    ]);
  });

  it("keeps the site finding when the name finds the same board", async () => {
    // `Lever Demo` дає `leverdemo` і за назвою - але сайт надійніший.
    expect(
      await discoverSources(
        { siteUrl: "https://acme.example", name: "Lever Demo" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://jobs.lever.co/leverdemo",
        platform: "lever",
        via: "site",
        vacancies: 10,
      },
    ]);
  });

  it("searches by name alone when there is no site", async () => {
    expect(
      await discoverSources({ siteUrl: null, name: "Linear" }, client()),
    ).toEqual([
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        via: "name",
        vacancies: 33,
      },
    ]);
  });

  it("still searches by name when the site does not answer", async () => {
    expect(
      await discoverSources(
        { siteUrl: "https://linear.example", name: "Linear" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        via: "name",
        vacancies: 33,
      },
    ]);
  });
});
