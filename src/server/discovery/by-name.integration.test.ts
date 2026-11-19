import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { findBoardsByName } from "./by-name.ts";

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

// Збережені справжні дошки - src/server/http/testing/README.md. На решту
// платформ фейковий сервер відповідає 404, як і справжні на чужу назву.
describe("findBoardsByName", () => {
  it("finds the board that has the company name", async () => {
    expect(
      await findBoardsByName({ name: "Linear", siteUrl: null }, client()),
    ).toEqual([
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        vacancies: 33,
      },
    ]);
  });

  it("tries every name variant on every platform", async () => {
    // `leverdemo` - назва разом, `team` - домен.
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
      },
      {
        url: "https://team.peopleforce.io/careers",
        platform: "peopleforce",
        vacancies: 6,
      },
    ]);
  });

  it("finds nothing for a name no board has", async () => {
    expect(
      await findBoardsByName({ name: "Initech", siteUrl: null }, client()),
    ).toEqual([]);
  });
});
