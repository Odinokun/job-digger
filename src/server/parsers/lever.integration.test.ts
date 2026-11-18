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

function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

/**
 * Окремий сервер для випадків, яких немає в збережених відповідях. Фейковий
 * вебсервер ігнорує рядок запиту, а сторінки Lever розрізняє саме він
 * (`skip`, `limit`), тож сторінки віддає цей сервер.
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

/** Сайт Lever із `total` оголошеннями, що віддає їх порціями за `skip`/`limit`. */
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
    // Справжній Lever на невідомий сайт відповідає 404 (перевірено 18.11.2026),
    // фейковий вебсервер без збереженої відповіді - теж.
    const result = await readLever(
      "https://jobs.lever.co/no-such-site",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Lever board", async () => {
    const result = await readLever(
      "https://bosch.com/careers",
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
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
        { pageSize: 100 },
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
        { pageSize: 100 },
      );

      expect(result.ok && result.vacancies).toHaveLength(200);
      expect(requested).toHaveLength(3);
    });
  });

  it("stops at the page limit and still counts as a success", async () => {
    // Досягнення ліміту сторінок - нормальне завершення (задача 3.12).
    const requested: string[] = [];

    await withServer(pagedSite(250, requested), async (origin) => {
      const result = await readLever(
        "https://jobs.lever.co/acme",
        clientFor(origin),
        { pageSize: 100, maxPages: 2 },
      );

      expect(result.ok && result.vacancies).toHaveLength(200);
      expect(requested).toHaveLength(2);
    });
  });

  it("fails the whole check when a later page fails", async () => {
    // Половина списку виглядала б як «решта вакансій зникла» і потягнула б
    // їхнє видалення - тож збій будь-якої сторінки - збій усього джерела.
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
