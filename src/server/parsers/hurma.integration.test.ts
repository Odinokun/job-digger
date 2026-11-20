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
import { readHurma } from "./hurma.ts";

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
 * Окремий сервер для того, чого не видно в збережених відповідях: фейковий
 * вебсервер ігнорує рядок запиту (`?page=N`) і не читає заголовків.
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

/**
 * API Hurma з `total` вакансіями по `perPage` на сторінці. Як справжній, без
 * `X-Requested-With` відповідає 403, а `links.next` порожнє на останній сторінці.
 */
function pagedApi(total: number, requested: string[], perPage = 2) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://fake");
    requested.push(`${url.pathname}${url.search}`);

    if (request.headers["x-requested-with"] !== "XMLHttpRequest") {
      response.writeHead(403, { "content-type": "application/json" });
      response.end('{"message":""}');
      return;
    }

    const page = Number(url.searchParams.get("page") ?? 1);
    const from = (page - 1) * perPage;
    const count = Math.max(0, Math.min(perPage, total - from));
    const data = Array.from({ length: count }, (_, index) => ({
      name: `Vacancy ${from + index + 1}`,
      public_url: `https://acme.hurma.work/public-vacancies/${from + index + 1}`,
      residence: "",
      work_format: null,
    }));
    const next =
      from + count < total
        ? `https://acme.hurma.work/api/v1/public-vacancies?page=${page + 1}`
        : null;

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data, links: { next }, meta: {} }));
  };
}

describe("readHurma", () => {
  it("reads the vacancies of a real board from a vacancy link", async () => {
    const result = await readHurma(
      "https://spribe.hurma.work/public-vacancies/72",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(6);
  });

  it("asks for pages with the header the API needs until there is no next one", async () => {
    const requested: string[] = [];

    await withServer(pagedApi(5, requested), async (origin) => {
      const result = await readHurma(
        "https://acme.hurma.work/public-vacancies",
        clientFor(origin),
        { maxPages: 10 },
      );

      expect(result.ok && result.vacancies.map((v) => v.externalId)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
      ]);
    });

    expect(requested).toEqual([
      "/acme.hurma.work/api/v1/public-vacancies?per_page=100&page=1",
      "/acme.hurma.work/api/v1/public-vacancies?per_page=100&page=2",
      "/acme.hurma.work/api/v1/public-vacancies?per_page=100&page=3",
    ]);
  });

  it("stops at the page limit", async () => {
    const requested: string[] = [];

    await withServer(pagedApi(9, requested), async (origin) => {
      const result = await readHurma(
        "https://acme.hurma.work/public-vacancies",
        clientFor(origin),
        { maxPages: 2 },
      );

      expect(result.ok && result.vacancies).toHaveLength(4);
      // Список не дочитано - життєвий цикл не має нічого закривати (6.16).
      expect(result.ok && result.truncated).toBe(true);
    });

    expect(requested).toHaveLength(2);
  });

  it("reports a company that does not exist", async () => {
    const result = await readHurma(
      "https://no-such-company.hurma.work/public-vacancies",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Hurma board", async () => {
    const result = await readHurma(
      "https://support.hurma.work/en",
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});

describe("read depth (task 6.16)", () => {
  it("reads only the first page for a first-page check and says the list may go on", async () => {
    const requested: string[] = [];

    await withServer(pagedApi(9, requested), async (origin) => {
      const result = await readHurma(
        "https://acme.hurma.work/public-vacancies",
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

    await withServer(pagedApi(5, requested), async (origin) => {
      const result = await readHurma(
        "https://acme.hurma.work/public-vacancies",
        clientFor(origin),
        { maxPages: 10 },
      );

      expect(result.ok && result.vacancies.length).toBeGreaterThan(0);
      expect(result.ok && result.truncated).toBeUndefined();
    });
  });
});
