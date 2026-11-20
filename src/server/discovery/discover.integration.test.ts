import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { discoverCompany, discoverSources } from "./discover.ts";

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
        trial: { kind: "read", vacancies: 10, more: false },
        ownership: null,
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
        trial: { kind: "unsupported" },
        ownership: null,
      },
    ]);
  });

  it("keeps a known ATS without a parser as one unreadable finding", async () => {
    // Головна й кар'єрна сторінка Hooli ведуть на різні вакансії BambooHR: одна
    // знахідка на платформу, з першого посилання. Кар'єрна сторінка - не
    // власна, бо веде на ATS (задача 5.15).
    expect(
      await discoverSources(
        { siteUrl: "https://hooli.example", name: "Hooli" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://hooli.bamboohr.com/careers/56",
        platform: "unsupported",
        via: "site",
        trial: { kind: "unsupported" },
        ownership: null,
      },
    ]);
  });

  it("tells a board that did not answer from a page nothing can read", async () => {
    // Сайт Wayne веде на дошку Greenhouse `ghost`, якої немає: це не власна
    // сторінка, а дошка, яку не вдалося прочитати.
    expect(
      await discoverSources(
        { siteUrl: "https://wayne.example", name: "Wayne" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://job-boards.greenhouse.io/ghost",
        platform: "greenhouse",
        via: "site",
        trial: { kind: "failed" },
        ownership: null,
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
        trial: { kind: "read", vacancies: 10, more: false },
        ownership: null,
      },
    ]);
  });

  it("searches by name alone when there is no site", async () => {
    // Без сайту підтверджувати належність нема чим.
    expect(
      await discoverSources({ siteUrl: null, name: "Linear" }, client()),
    ).toEqual([
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        via: "name",
        trial: { kind: "read", vacancies: 33, more: false },
        ownership: { kind: "unknown" },
      },
    ]);
  });

  it("confirms a board found by name that links to the company site", async () => {
    // Сторінка дошки Ashby `linear` називає сайт `linear.app`
    // (src/server/http/testing/README.md). Головної linear.app на фейковому
    // сервері немає - лишається пошук за назвою.
    expect(
      await discoverSources(
        { siteUrl: "https://linear.app", name: "Linear" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        via: "name",
        trial: { kind: "read", vacancies: 33, more: false },
        ownership: { kind: "confirmed" },
      },
    ]);
  });

  it("still searches by name when the site does not answer", async () => {
    // Дошка `linear` називає своїм інший сайт - схоже, інша компанія.
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
        trial: { kind: "read", vacancies: 33, more: false },
        ownership: { kind: "other", site: "linear.app" },
      },
    ]);
  });
});

describe("discoverCompany", () => {
  it("says when the company site did not answer", async () => {
    const result = await discoverCompany(
      { siteUrl: "https://linear.example", name: "Linear" },
      client(),
    );

    expect(result.siteFailed).toBe(true);
    // Пошук за назвою це не зупиняє.
    expect(result.findings).toHaveLength(1);
  });

  it("does not call a site that answered failed", async () => {
    const result = await discoverCompany(
      { siteUrl: "https://acme.example", name: "Acme" },
      client(),
    );

    expect(result.siteFailed).toBe(false);
  });

  it("has no site to fail without one", async () => {
    const result = await discoverCompany(
      { siteUrl: null, name: "Linear" },
      client(),
    );

    expect(result.siteFailed).toBe(false);
  });
});
