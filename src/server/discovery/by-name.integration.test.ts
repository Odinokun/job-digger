import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { findBoardsByName } from "./by-name.ts";

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

function client(): HttpClient {
  return createHttpClient({
    fakeOrigin: fakeWeb.origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

// Saved real boards: src/server/http/testing/README.md. For the other
// platforms the fake server answers 404, as the real ones do for a foreign name.
describe("findBoardsByName", () => {
  it("finds the board that has the company name", async () => {
    expect(
      await findBoardsByName({ name: "Linear", siteUrl: null }, client()),
    ).toEqual([
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        vacancies: 33,
        more: false,
      },
    ]);
  });

  it("tries every name variant on every platform", async () => {
    // `leverdemo` is the name joined, `team` the domain.
    expect(
      await findBoardsByName(
        { name: "Lever Demo", siteUrl: "https://team.example" },
        client(),
      ),
    ).toEqual([
      {
        url: "https://jobs.lever.co/leverdemo",
        platform: "lever",
        vacancies: 10,
        more: false,
      },
      {
        url: "https://team.peopleforce.io/careers",
        platform: "peopleforce",
        vacancies: 6,
        more: false,
      },
    ]);
  });

  it("reads only the first page of a board and says there is more", async () => {
    // Task 6.16: the trial read is the first page. The saved Webellian page has
    // `rel="next"`, so there are more vacancies than the 10 read.
    expect(
      await findBoardsByName({ name: "Webellian", siteUrl: null }, client()),
    ).toEqual([
      {
        url: "https://webellian.peopleforce.io/careers",
        platform: "peopleforce",
        vacancies: 10,
        more: true,
      },
    ]);
  });

  it("finds nothing for a name no board has", async () => {
    expect(
      await findBoardsByName({ name: "Initech", siteUrl: null }, client()),
    ).toEqual([]);
  });
});
