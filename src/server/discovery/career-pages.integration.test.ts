import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, type HttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { fetchText } from "../parsers/shared.ts";
import { findSiteCareerPages } from "./career-pages.ts";

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

/** The home page - the ATS link search has already read it (5.02). */
async function findFor(site: string) {
  const http = client();
  const home = await fetchText(http, site);
  if (!home.ok) throw new Error(`No saved home page for ${site}`);

  return findSiteCareerPages(home, http);
}

// Synthetic sites: src/server/http/testing/README.md.
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
    // /careers has no ATS - it is the company's own page.
    expect(await findFor("https://initech.example")).toEqual({
      boards: [],
      pages: ["https://initech.example/careers"],
    });
  });

  it("takes a career page in PeopleForce markup for a PeopleForce board (task 5.13)", async () => {
    // Careers leads to a subdomain of the site, which has PeopleForce on the
    // company's domain: it can be recognised only by markup, not by host.
    expect(await findFor("https://kramerica.example")).toEqual({
      boards: [
        {
          url: "https://jobs.kramerica.example/careers",
          platform: "peopleforce",
        },
      ],
      pages: [],
    });
  });

  it("follows a career page one step further to a PeopleForce board on the site (task 5.13)", async () => {
    // Like SoftConstruct: an own Careers page without an ATS leads to a subdomain
    // with PeopleForce. The Careers page itself is no longer a finding - the board is.
    expect(await findFor("https://vandelay.example")).toEqual({
      boards: [
        {
          url: "https://peopleforce.vandelay.example/careers",
          platform: "peopleforce",
        },
      ],
      pages: [],
    });
  });

  it("falls back to the sitemap", async () => {
    expect(await findFor("https://umbrella.example")).toEqual({
      boards: [{ url: "https://jobs.ashbyhq.com/linear", platform: "ashby" }],
      pages: [],
    });
  });

  it("drops a career link that redirects away from careers", async () => {
    // A career link sometimes redirects to an error page that answers 200 (as at
    // Palantir on 19.11.2026). The fake web server cannot redirect, so this test
    // runs its own server with a few pages. Two addresses that redirect to one
    // page give one finding (Grammarly).
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
    // The Acme home page leads straight to a board - that is atsLinksOnPage's
    // job - and it has no career pages, typical addresses or sitemap of its own.
    expect(await findFor("https://acme.example")).toEqual({
      boards: [],
      pages: [],
    });
  });
});
