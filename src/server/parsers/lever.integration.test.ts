import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readLever } from "./lever.ts";
import { pagesToRead } from "./vacancies-to-check.ts";

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

function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

/**
 * A separate server for cases the saved responses do not have. The fake web
 * server ignores the query string, and that is exactly what tells Lever pages
 * apart (`skip`, `limit`), so this server serves the pages.
 */
async function withServer(
  respond: (request: IncomingMessage, response: ServerResponse) => void,
  run: (origin: string) => Promise<void>,
) {
  const server: Server = createServer(respond);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}

/** A Lever site with `total` postings that serves them in chunks by `skip`/`limit`. */
function pagedSite(total: number, requested: string[]) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://fake");
    requested.push(`${url.pathname}${url.search}`);
    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? total);
    const page = Array.from(
      { length: Math.max(0, Math.min(limit, total - skip)) },
      (_, i) => {
        const id = `00000000-0000-4000-8000-${String(skip + i).padStart(12, "0")}`;
        return {
          id,
          text: `Job ${skip + i}`,
          hostedUrl: `https://jobs.lever.co/acme/${id}`,
          categories: { location: "Kyiv" },
        };
      },
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(page));
  };
}

describe("readLever", () => {
  it("reads the vacancies of a real site", async () => {
    const result = await readLever(
      "https://jobs.lever.co/leverdemo",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(10);
  });

  it("reports a site that does not exist", async () => {
    // The real Lever answers 404 for an unknown site (checked 18.11.2026), and so
    // does the fake web server without a saved response.
    const result = await readLever(
      "https://jobs.lever.co/no-such-site",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Lever board", async () => {
    const result = await readLever(
      "https://bosch.com/careers",
      // Nobody listens on port 1: if a request went out, it would be fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("reads a large site page by page", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(250, requested), async (origin) => {
      const result = await readLever(
        "https://jobs.lever.co/acme",
        clientFor(origin),
        { pageSize: 100, maxPages: 5 },
      );

      expect(result.ok && result.vacancies).toHaveLength(250);
      expect(requested).toEqual([
        "/api.lever.co/v0/postings/acme?mode=json&skip=0&limit=100",
        "/api.lever.co/v0/postings/acme?mode=json&skip=100&limit=100",
        "/api.lever.co/v0/postings/acme?mode=json&skip=200&limit=100",
      ]);
    });
  });

  it("asks once more when the last page was exactly full", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(200, requested), async (origin) => {
      const result = await readLever(
        "https://jobs.lever.co/acme",
        clientFor(origin),
        { pageSize: 100, maxPages: 5 },
      );

      expect(result.ok && result.vacancies).toHaveLength(200);
      expect(requested).toHaveLength(3);
    });
  });

  it("stops at the page limit and still counts as a success", async () => {
    // Reaching the page limit is a normal finish (task 3.12).
    const requested: string[] = [];

    await withServer(pagedSite(250, requested), async (origin) => {
      const result = await readLever(
        "https://jobs.lever.co/acme",
        clientFor(origin),
        { pageSize: 100, maxPages: 2 },
      );

      expect(result.ok && result.vacancies).toHaveLength(200);
      // The list was not read to the end - the lifecycle must close nothing (6.16).
      expect(result.ok && result.truncated).toBe(true);
      expect(requested).toHaveLength(2);
    });
  });

  it("reads up to Vacancies to check by default", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(10_000, requested), async (origin) => {
      await readLever("https://jobs.lever.co/acme", clientFor(origin));

      expect(requested).toHaveLength(
        pagesToRead({ pageSize: 100, depth: "full" }),
      );
    });
  });

  it("fails the whole check when a later page fails", async () => {
    // Half a list would look like "the other vacancies are gone" and lead to
    // their deletion - so a failure of any page is a failure of the whole source.
    const requested: string[] = [];
    const firstPage = pagedSite(250, requested);

    await withServer(
      (request, response) => {
        if (requested.length === 0) {
          firstPage(request, response);
          return;
        }
        requested.push(request.url ?? "");
        response.writeHead(503);
        response.end();
      },
      async (origin) => {
        const result = await readLever(
          "https://jobs.lever.co/acme",
          clientFor(origin),
          { pageSize: 100 },
        );

        expect(result).toEqual({
          ok: false,
          error: { reason: "bad-status", status: 503 },
        });
      },
    );
  });

  it("asks the EU API for an EU job board", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(1, requested), async (origin) => {
      await readLever("https://jobs.eu.lever.co/lever", clientFor(origin));

      expect(requested[0]).toMatch(
        /^\/api\.eu\.lever\.co\/v0\/postings\/lever\?/,
      );
    });
  });

  it("reports an answer that is not JSON", async () => {
    await withServer(
      (_request, response) => {
        response.writeHead(200);
        response.end("<html>maintenance</html>");
      },
      async (origin) => {
        const result = await readLever(
          "https://jobs.lever.co/acme",
          clientFor(origin),
        );

        expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
      },
    );
  });
});

describe("read depth (task 6.16)", () => {
  it("reads only the first page for a first-page check and says the list may go on", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(10_000, requested), async (origin) => {
      const result = await readLever(
        "https://jobs.lever.co/acme",
        clientFor(origin),
        {
          depth: "first-page",
        },
      );

      expect(result.ok && result.truncated).toBe(true);
    });

    expect(requested).toHaveLength(1);
  });

  it("does not mark a list read to its end as truncated", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(250, requested), async (origin) => {
      const result = await readLever(
        "https://jobs.lever.co/acme",
        clientFor(origin),
        { pageSize: 100, maxPages: 5 },
      );

      expect(result.ok && result.vacancies.length).toBeGreaterThan(0);
      expect(result.ok && result.truncated).toBeUndefined();
    });
  });
});
