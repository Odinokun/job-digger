import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { fetchText } from "../parsers/shared.ts";
import { findSiteCareerPages } from "./career-pages.ts";

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

/** Головна сторінка - її вже прочитав пошук посилань на ATS (5.02). */
async function findFor(site: string) {
  const http = client();
  const home = await fetchText(http, site);
  if (!home.ok) throw new Error(`No saved home page for ${site}`);

  return findSiteCareerPages(home, http);
}

// Синтетичні сайти - src/server/http/testing/README.md.
describe("findSiteCareerPages", () => {
  it("follows a career link to the board embedded there", async () => {
    expect(await findFor("https://globex.example")).toEqual({
      boards: [
        {
          url: "https://job-boards.greenhouse.io/discord",
          platform: "greenhouse",
        },
      ],
      pages: [],
    });
  });

  it("tries the usual addresses when the home page has no career link", async () => {
    // На /careers немає ATS - це власна сторінка компанії.
    expect(await findFor("https://initech.example")).toEqual({
      boards: [],
      pages: ["https://initech.example/careers"],
    });
  });

  it("falls back to the sitemap", async () => {
    expect(await findFor("https://umbrella.example")).toEqual({
      boards: [{ url: "https://jobs.ashbyhq.com/linear", platform: "ashby" }],
      pages: [],
    });
  });

  it("drops a career link that redirects away from careers", async () => {
    // Буває, що кар'єрне посилання веде редиректом на сторінку помилки, яка
    // відповідає 200 (так 19.11.2026 у Palantir). Фейковий вебсервер
    // редиректів не вміє, тож тут свій сервер на кілька сторінок. Дві адреси,
    // що редиректять на одну сторінку, дають одну знахідку (Grammarly).
    const pages: Record<string, string> = {
      "/hooli.example/": `<a href="/careers">Careers</a><a href="/jobs-old">Jobs</a><a href="/join">Join us</a>`,
      "/hooli.example/careers": "<h1>Careers</h1>",
      "/hooli.example/404": "<h1>Page not found</h1>",
    };
    const server = createServer((request, response) => {
      const redirects: Record<string, string> = {
        "/hooli.example/jobs-old": "https://hooli.example/404",
        "/hooli.example/join": "https://hooli.example/careers",
      };
      const location = redirects[request.url ?? ""];
      if (location !== undefined) {
        response.writeHead(302, { location });
        response.end();
        return;
      }
      const body = pages[request.url ?? ""];
      response.writeHead(body === undefined ? 404 : 200, {
        "content-type": "text/html",
      });
      response.end(body ?? "");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as AddressInfo;

    try {
      const http = createHttpClient({
        fakeOrigin: `http://127.0.0.1:${port}`,
        limiter: noLimits,
        sleep: async () => {},
        timeoutMs: 1000,
      });
      const home = await fetchText(http, "https://hooli.example");
      if (!home.ok) throw new Error("The home page did not answer");

      expect(await findSiteCareerPages(home, http)).toEqual({
        boards: [],
        pages: ["https://hooli.example/careers"],
      });
    } finally {
      await new Promise((done) => server.close(done));
    }
  });

  it("finds nothing on a site without career pages", async () => {
    // Головна Acme веде одразу на дошку - це справа atsLinksOnPage, а своїх
    // кар'єрних сторінок, типових адрес і sitemap у неї немає.
    expect(await findFor("https://acme.example")).toEqual({
      boards: [],
      pages: [],
    });
  });
});
