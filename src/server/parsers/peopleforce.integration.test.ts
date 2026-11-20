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
import { readPeopleForce } from "./peopleforce.ts";
import { pagesToRead } from "./vacancies-to-check.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

const ACME = "https://acme.peopleforce.io/careers";

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
 * вебсервер ігнорує рядок запиту, а сторінки PeopleForce розрізняє саме він
 * (`?page=N`), тож сторінки віддає цей сервер.
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
 * Сайт кар'єри з `total` вакансіями по `perPage` на сторінці в розмітці
 * PeopleForce: лічильник, картки і посилання `rel="next"`, поки сторінка не
 * остання. Як справжній (перевірено на Webellian 18.11.2026), номер за межею
 * віддає останню сторінку.
 */
function pagedSite(total: number, requested: string[], perPage = 10) {
  return (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://fake");
    requested.push(`${url.pathname}${url.search}`);
    const pages = Math.max(1, Math.ceil(total / perPage));
    const page = Math.min(Number(url.searchParams.get("page") ?? 1), pages);
    const from = (page - 1) * perPage;
    const count = Math.max(0, Math.min(perPage, total - from));
    const cards = Array.from(
      { length: count },
      (_, i) =>
        `<div><h4><a href="/careers/v/${from + i + 1}-job">Job ${from + i + 1}</a></h4></div>`,
    ).join("");
    const counter =
      total === 0
        ? "<div>There are currently no vacancies.</div>"
        : `<div>Displaying <strong>${from + 1} - ${from + count}</strong> of <strong>${total}</strong></div>`;
    const next =
      page < pages
        ? `<nav aria-label="pager"><a href="/careers?page=${page + 1}" rel="next">next</a></nav>`
        : "";

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      `<html><body><div id="results">${counter}${cards}${next}</div></body></html>`,
    );
  };
}

describe("readPeopleForce", () => {
  it("reads the vacancies of a real career site", async () => {
    const result = await readPeopleForce(
      "https://team.peopleforce.io/careers",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(6);
  });

  it("reports a company that does not exist", async () => {
    // Справжній PeopleForce відповідає 404 і на невідому компанію, і на
    // компанію без сторінки кар'єри (через редирект на /404, перевірено
    // 18.11.2026); фейковий вебсервер без відповіді - теж 404.
    const result = await readPeopleForce(
      "https://no-such-company.peopleforce.io/careers",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a PeopleForce site", async () => {
    const result = await readPeopleForce(
      "https://bosch.com/careers",
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("reads the list page by page until there is no next page", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(23, requested), async (origin) => {
      // Ліміт задано явно: значення з `.env` автора тут ні до чого.
      const result = await readPeopleForce(ACME, clientFor(origin), {
        maxPages: 5,
      });

      expect(result.ok && result.vacancies).toHaveLength(23);
      expect(requested).toEqual([
        "/acme.peopleforce.io/careers?page=1",
        "/acme.peopleforce.io/careers?page=2",
        "/acme.peopleforce.io/careers?page=3",
      ]);
    });
  });

  it("reads an empty list as no vacancies", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(0, requested), async (origin) => {
      const result = await readPeopleForce(ACME, clientFor(origin));

      expect(result).toEqual({ ok: true, vacancies: [], skipped: 0 });
    });
  });

  it("stops at the page limit and still counts as a success", async () => {
    // Досягнення ліміту сторінок - нормальне завершення (задача 3.12).
    const requested: string[] = [];

    await withServer(pagedSite(100, requested), async (origin) => {
      const result = await readPeopleForce(ACME, clientFor(origin), {
        maxPages: 2,
      });

      expect(result.ok && result.vacancies).toHaveLength(20);
      // Список не дочитано - життєвий цикл не має нічого закривати (6.16).
      expect(result.ok && result.truncated).toBe(true);
      expect(requested).toHaveLength(2);
    });
  });

  it("reads up to Vacancies to check by default", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(1000, requested), async (origin) => {
      await readPeopleForce(ACME, clientFor(origin));

      expect(requested).toHaveLength(
        pagesToRead({ pageSize: 10, depth: "full" }),
      );
    });
  });

  it("fails the whole check when a later page fails", async () => {
    // Половина списку виглядала б як «решта вакансій зникла» і потягнула б
    // їхнє видалення - тож збій будь-якої сторінки - збій усього джерела.
    const requested: string[] = [];
    const firstPage = pagedSite(23, requested);

    await withServer(
      (request, response) => {
        if (requested.length === 0) {
          firstPage(request, response);
          return;
        }
        response.writeHead(503);
        response.end();
      },
      async (origin) => {
        const result = await readPeopleForce(ACME, clientFor(origin));

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
    const requested: string[] = [];

    await withServer(pagedSite(1000, requested), async (origin) => {
      const result = await readPeopleForce(ACME, clientFor(origin), {
        depth: "first-page",
      });

      expect(result.ok && result.truncated).toBe(true);
    });

    expect(requested).toHaveLength(1);
  });

  it("does not mark a list read to its end as truncated", async () => {
    const requested: string[] = [];

    await withServer(pagedSite(23, requested), async (origin) => {
      const result = await readPeopleForce(ACME, clientFor(origin), {
        maxPages: 5,
      });

      expect(result.ok && result.vacancies.length).toBeGreaterThan(0);
      expect(result.ok && result.truncated).toBeUndefined();
    });
  });
});
