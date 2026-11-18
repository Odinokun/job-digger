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
import { PAGES_TO_CHECK } from "./pages-to-check.ts";
import { readWorkday } from "./workday.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
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
 * Окремий сервер для випадків, яких немає в збережених відповідях. Фейковий
 * вебсервер тіло запиту не читає, а сторінки Workday розрізняє саме воно
 * (`offset`, `limit`), тож сторінки віддає цей сервер.
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

/** Що прийшло на сервер: шлях і розібране тіло POST. */
interface Received {
  method: string | undefined;
  path: string | undefined;
  body: { limit: number; offset: number; [key: string]: unknown };
}

/**
 * Сайт Workday з `total` вакансіями, що віддає їх порціями за `offset`/`limit`.
 * Як справжній (перевірено на NVIDIA 18.11.2026): `total` - лише на першій
 * сторінці, на решті там 0.
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
    // Справжній Workday на невідомий сайт відповідає 404 «not found:
    // Job_Posting_Site_ID» (перевірено 18.11.2026), фейковий вебсервер - теж.
    const result = await readWorkday(
      "https://nvidia.wd5.myworkdayjobs.com/NoSuchSite",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Workday site", async () => {
    const result = await readWorkday(
      "https://bosch.com/careers",
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("asks for the list page by page with POST", async () => {
    const received: Received[] = [];

    await withServer(pagedSite(45, received), async (origin) => {
      // Ліміт задано явно: значення з `.env` автора тут ні до чого.
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
    // Сторінка після останньої не порожня: з offset від 2000 Workday знову
    // віддає першу (перевірено на NVIDIA). Тож кінець - за `total`.
    const received: Received[] = [];

    await withServer(pagedSite(40, received), async (origin) => {
      const result = await readWorkday(ACME, clientFor(origin));

      expect(result.ok && result.vacancies).toHaveLength(40);
      expect(received).toHaveLength(2);
    });
  });

  it("stops at the page limit and still counts as a success", async () => {
    // Досягнення ліміту сторінок - нормальне завершення (задача 3.12).
    const received: Received[] = [];

    await withServer(pagedSite(2000, received), async (origin) => {
      const result = await readWorkday(ACME, clientFor(origin), {
        maxPages: 3,
      });

      expect(result.ok && result.vacancies).toHaveLength(60);
      expect(received).toHaveLength(3);
    });
  });

  it("reads Pages to check pages by default", async () => {
    const received: Received[] = [];

    await withServer(pagedSite(2000, received), async (origin) => {
      await readWorkday(ACME, clientFor(origin));

      expect(received).toHaveLength(PAGES_TO_CHECK);
    });
  });

  it("fails the whole check when a later page fails", async () => {
    // Половина списку виглядала б як «решта вакансій зникла» і потягнула б
    // їхнє видалення - тож збій будь-якої сторінки - збій усього джерела.
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
