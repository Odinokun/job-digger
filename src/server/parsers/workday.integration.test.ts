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
import { readWorkday } from "./workday.ts";
import { pagesToRead } from "./vacancies-to-check.ts";

/** The request schedule is not tested here - it has its own tests. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

const ACME = "https://acme.wd3.myworkdayjobs.com/External";

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
 * server does not read the request body, and that is exactly what tells Workday
 * pages apart (`offset`, `limit`), so this server serves the pages.
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

/** What reached the server: the path and the parsed POST body. */
interface Received {
  method: string | undefined;
  path: string | undefined;
  body: { limit: number; offset: number; [key: string]: unknown };
}

/**
 * A Workday site with `total` vacancies that serves them in chunks by
 * `offset`/`limit`. Like the real one (checked on NVIDIA 18.11.2026): `total` is
 * only on the first page, the rest have 0 there.
 */
function pagedSite(total: number, received: Received[]) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      received.push({ method: request.method, path: request.url, body });
      const { offset, limit } = body;
      const jobPostings = Array.from(
        { length: Math.max(0, Math.min(limit, total - offset)) },
        (_, i) => ({
          title: `Job ${offset + i}`,
          externalPath: `/job/Kyiv/Job_JR${offset + i}`,
          locationsText: "Kyiv",
          postedOn: "Posted Today",
          bulletFields: [`JR${offset + i}`],
        }),
      );
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ total: offset === 0 ? total : 0, jobPostings }),
      );
    });
  };
}

describe("readWorkday", () => {
  it("reads the vacancies of a real site", async () => {
    const result = await readWorkday(
      "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(11);
  });

  it("reports a site that does not exist", async () => {
    // The real Workday answers 404 "not found: Job_Posting_Site_ID" for an
    // unknown site (checked 18.11.2026), and so does the fake web server.
    const result = await readWorkday(
      "https://nvidia.wd5.myworkdayjobs.com/NoSuchSite",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Workday site", async () => {
    const result = await readWorkday(
      "https://bosch.com/careers",
      // Nobody listens on port 1: if a request went out, it would be fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("asks for the list page by page with POST", async () => {
    const received: Received[] = [];

    await withServer(pagedSite(45, received), async (origin) => {
      // The limit is explicit: the value from the author's `.env` has nothing to do with it.
      const result = await readWorkday(ACME, clientFor(origin), {
        maxPages: 5,
      });

      expect(result.ok && result.vacancies).toHaveLength(45);
      expect(received).toEqual(
        [0, 20, 40].map((offset) => ({
          method: "POST",
          path: "/acme.wd3.myworkdayjobs.com/wday/cxs/acme/External/jobs",
          body: { appliedFacets: {}, limit: 20, offset, searchText: "" },
        })),
      );
    });
  });

  it("trusts the total of the first page and does not ask past it", async () => {
    // The page after the last one is not empty: from an offset of 2000 Workday
    // serves the first page again (checked on NVIDIA). So the end comes from `total`.
    const received: Received[] = [];

    await withServer(pagedSite(40, received), async (origin) => {
      const result = await readWorkday(ACME, clientFor(origin));

      expect(result.ok && result.vacancies).toHaveLength(40);
      expect(received).toHaveLength(2);
    });
  });

  it("stops at the page limit and still counts as a success", async () => {
    // Reaching the page limit is a normal finish (task 3.12).
    const received: Received[] = [];

    await withServer(pagedSite(2000, received), async (origin) => {
      const result = await readWorkday(ACME, clientFor(origin), {
        maxPages: 3,
      });

      expect(result.ok && result.vacancies).toHaveLength(60);
      // The list was not read to the end - the lifecycle must close nothing (6.16).
      expect(result.ok && result.truncated).toBe(true);
      expect(received).toHaveLength(3);
    });
  });

  it("reads up to Vacancies to check by default", async () => {
    const received: Received[] = [];

    await withServer(pagedSite(2000, received), async (origin) => {
      await readWorkday(ACME, clientFor(origin));

      expect(received).toHaveLength(
        pagesToRead({ pageSize: 20, depth: "full" }),
      );
    });
  });

  it("fails the whole check when a later page fails", async () => {
    // Half a list would look like "the other vacancies are gone" and lead to
    // their deletion - so a failure of any page is a failure of the whole source.
    const received: Received[] = [];
    const firstPage = pagedSite(45, received);

    await withServer(
      (request, response) => {
        if (received.length === 0) {
          firstPage(request, response);
          return;
        }
        response.writeHead(503);
        response.end();
      },
      async (origin) => {
        const result = await readWorkday(ACME, clientFor(origin));

        expect(result).toEqual({
          ok: false,
          error: { reason: "bad-status", status: 503 },
        });
      },
    );
  });
});

describe("read depth (task 6.16)", () => {
  it("reads only the first page for a first-page check and says the list may go on", async () => {
    const requested: Received[] = [];

    await withServer(pagedSite(2000, requested), async (origin) => {
      const result = await readWorkday(ACME, clientFor(origin), {
        depth: "first-page",
      });

      expect(result.ok && result.truncated).toBe(true);
    });

    expect(requested).toHaveLength(1);
  });

  it("does not mark a list read to its end as truncated", async () => {
    const requested: Received[] = [];

    await withServer(pagedSite(45, requested), async (origin) => {
      const result = await readWorkday(ACME, clientFor(origin), {
        maxPages: 5,
      });

      expect(result.ok && result.vacancies.length).toBeGreaterThan(0);
      expect(result.ok && result.truncated).toBeUndefined();
    });
  });
});
