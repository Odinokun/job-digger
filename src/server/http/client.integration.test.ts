import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createHttpClient, HttpError, USER_AGENT } from "./client.ts";
import type { HostLimiter } from "./host-limiter.ts";
import { createSafeLookup } from "./ssrf.ts";

/**
 * Обмежувач без обмежень: ці тести перевіряють редиректи, ліміти й повтори, а не
 * розклад запитів - справжній додав би 2 с на кожен запит. Розклад має власні
 * тести (host-limiter.test.ts), а підключення - тест «limiter» нижче.
 */
const noLimits: HostLimiter = { run: (_host, task) => task() };

/**
 * Локальний сервер, якому тест сам задає відповіді. Клієнт іде на нього через
 * підміну адреси: просить `https://site.test/...`, а потрапляє на
 * `{origin}/site.test/...` - так само, як застосунок у тестах іде на фейковий
 * вебсервер. Захист від SSRF при цьому перевіряє справжню, логічну адресу.
 */
let server: Server;
let origin: string;
/** Шляхи всіх запитів, що дійшли до сервера, у порядку надходження. */
let received: IncomingMessage[];
/** Відповідь сервера - кожен тест задає свою. */
let respond: (request: IncomingMessage, response: ServerResponse) => void;

beforeAll(async () => {
  server = createServer((request, response) => {
    received.push(request);
    respond(request, response);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  // Тести з тайм-аутом і лімітом лишають відповіді незавершеними - без цього
  // `close` чекав би на них вічно.
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
});

beforeEach(() => {
  received = [];
  respond = (_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("hello");
  };
});

/** Відповідь за шляхом запиту (з підміною, тобто `/site.test/...`). */
function routes(
  table: Record<string, (response: ServerResponse) => void>,
): typeof respond {
  return (request, response) => {
    const handler = table[request.url ?? ""];

    if (handler) {
      handler(response);
    } else {
      response.writeHead(404);
      response.end();
    }
  };
}

function redirect(location: string, status = 302) {
  return (response: ServerResponse) => {
    response.writeHead(status, { location });
    response.end();
  };
}

function ok(body: string) {
  return (response: ServerResponse) => {
    response.writeHead(200);
    response.end(body);
  };
}

/** Помилка, яку кинув виклик, - щоб перевірити її поля. */
async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to fail");
}

describe("createHttpClient", () => {
  it("gets a page through the fake origin and reports the logical address", async () => {
    const client = createHttpClient({ fakeOrigin: origin, limiter: noLimits });

    const response = await client.get("https://site.test/careers?team=eng");

    expect(response).toMatchObject({
      status: 200,
      url: "https://site.test/careers?team=eng",
      body: "hello",
    });
    expect(received.map((request) => request.url)).toEqual([
      "/site.test/careers?team=eng",
    ]);
  });

  it("introduces itself with an honest User-Agent", async () => {
    const client = createHttpClient({ fakeOrigin: origin, limiter: noLimits });

    await client.get("https://site.test/");

    expect(received[0]?.headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^JobDigger\//);
  });

  it("adds the headers of a request but keeps its own User-Agent", async () => {
    const client = createHttpClient({ fakeOrigin: origin, limiter: noLimits });

    await client.get("https://site.test/api", {
      headers: { "x-requested-with": "XMLHttpRequest", "User-Agent": "Other" },
    });
    await client.get("https://site.test/api");

    expect(received[0]?.headers["x-requested-with"]).toBe("XMLHttpRequest");
    expect(received[0]?.headers["user-agent"]).toBe(USER_AGENT);
    expect(received[1]?.headers["x-requested-with"]).toBeUndefined();
  });

  describe("post", () => {
    /** Сервер, що відповідає тілом запиту, - щоб побачити, що саме дійшло. */
    function echoBody(request: IncomingMessage, response: ServerResponse) {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.writeHead(200);
        response.end(Buffer.concat(chunks).toString("utf8"));
      });
    }

    it("sends a JSON body with POST and the same User-Agent", async () => {
      // Workday віддає список вакансій лише на POST з JSON
      // (src/server/parsers/README.md, «Workday»).
      respond = echoBody;
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
      });

      const response = await client.post("https://site.test/jobs", {
        limit: 20,
        searchText: "",
      });

      expect(response).toMatchObject({
        status: 200,
        url: "https://site.test/jobs",
        body: '{"limit":20,"searchText":""}',
      });
      expect(received[0]).toMatchObject({
        method: "POST",
        url: "/site.test/jobs",
      });
      expect(received[0]?.headers).toMatchObject({
        "content-type": "application/json",
        "user-agent": USER_AGENT,
      });
    });

    it("returns a redirect as it is instead of following it", async () => {
      // За RFC 9110 (15.4) після 301/302/303 браузери повторюють запит як GET,
      // а після 307/308 - як POST. Обидва варіанти для API, яке ми знаємо,
      // означають, що воно змінилося, - хай це побачить парсер.
      respond = routes({
        "/site.test/jobs": redirect("https://site.test/new"),
      });
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
      });

      const response = await client.post("https://site.test/jobs", {});

      expect(response.status).toBe(302);
      expect(received).toHaveLength(1);
    });

    it("retries a server error like a GET", async () => {
      // POST тут - читання (пошук вакансій), повтор нічого не змінює на сайті.
      let attempts = 0;
      respond = (request, response) => {
        attempts += 1;
        if (attempts === 1) {
          response.writeHead(500);
          response.end();
          return;
        }
        echoBody(request, response);
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep: async () => {},
      });

      const response = await client.post("https://site.test/jobs", { a: 1 });

      expect(response).toMatchObject({ status: 200, body: '{"a":1}' });
      expect(received).toHaveLength(2);
    });

    it("does not send anything to an address checkUrl refuses", async () => {
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
      });

      const error = await errorOf(client.post("http://10.0.0.1/jobs", {}));

      expect(error).toMatchObject({ reason: "blocked" });
      expect(received).toHaveLength(0);
    });
  });

  describe("redirects", () => {
    it("follows a redirect and reports the final address", async () => {
      respond = routes({
        "/site.test/old": redirect("https://site.test/new", 301),
        "/site.test/new": ok("moved here"),
      });
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
      });

      const response = await client.get("https://site.test/old");

      expect(response).toMatchObject({
        status: 200,
        url: "https://site.test/new",
        body: "moved here",
      });
    });

    it("resolves a relative Location against the current address", async () => {
      respond = routes({
        "/site.test/jobs/old": redirect("../careers"),
        "/site.test/careers": ok("relative"),
      });
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
      });

      const response = await client.get("https://site.test/jobs/old");

      expect(response.url).toBe("https://site.test/careers");
    });

    it("refuses a redirect to an internal address without requesting it", async () => {
      respond = routes({
        "/site.test/trap": redirect("http://127.0.0.1/admin"),
      });
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
      });

      const error = await errorOf(client.get("https://site.test/trap"));

      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ reason: "blocked" });
      expect(received.map((request) => request.url)).toEqual([
        "/site.test/trap",
      ]);
    });

    it("gives up after five redirects", async () => {
      respond = (request, response) => {
        const step = Number(request.url?.split("/").pop());
        redirect(`https://site.test/${step + 1}`)(response);
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
      });

      const error = await errorOf(client.get("https://site.test/0"));

      expect(error).toMatchObject({ reason: "too-many-redirects" });
      // Початковий запит і пʼять переходів.
      expect(received).toHaveLength(6);
    });
  });

  describe("limits", () => {
    it("gives up when the site does not answer in time", async () => {
      respond = () => {
        // Мовчить: ні заголовків, ні тіла.
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        timeoutMs: 100,
        // Тайм-аут повторюється - без цього тест чекав би справжні 1 + 2 с.
        sleep: async () => {},
      });

      const error = await errorOf(client.get("https://site.test/slow"));

      expect(error).toMatchObject({ reason: "timeout" });
      // Тайм-аут - збій, що може минути, тож повторюється, як і мережа.
      expect(received).toHaveLength(3);
    });

    it("stops reading as soon as the body grows past the limit", async () => {
      respond = (_request, response) => {
        response.writeHead(200);
        // Шматки без кінця: якби клієнт чекав усе тіло, тест би завис.
        response.write("x".repeat(1024));
        response.write("x".repeat(1024));
        response.write("x".repeat(1024));
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        maxBytes: 2048,
      });

      const error = await errorOf(client.get("https://site.test/huge"));

      expect(error).toMatchObject({ reason: "too-large" });
    });

    it("refuses a declared Content-Length over the limit before the body", async () => {
      respond = (_request, response) => {
        response.writeHead(200, { "content-length": "10000" });
        response.flushHeaders();
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        maxBytes: 2048,
      });

      const error = await errorOf(client.get("https://site.test/declared"));

      expect(error).toMatchObject({ reason: "too-large" });
    });

    it("accepts a body exactly at the limit", async () => {
      respond = (_request, response) => {
        response.writeHead(200);
        response.end("x".repeat(2048));
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        maxBytes: 2048,
      });

      const response = await client.get("https://site.test/edge");

      expect(response.body).toHaveLength(2048);
    });

    it("refuses a complete body over the limit instead of returning it empty", async () => {
      // Тіло прийшло повністю й одним шматком: колись клієнт обривав запит, а
      // подія `end` усе одно приходила й давала успіх із порожнім тілом - для
      // парсера це «нуль вакансій», тобто видалення всіх.
      respond = (_request, response) => {
        response.writeHead(200);
        response.end("x".repeat(3072));
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        maxBytes: 2048,
      });

      const error = await errorOf(client.get("https://site.test/whole"));

      expect(error).toMatchObject({ reason: "too-large" });
    });

    it("lets one request allow a larger body, leaving the rest limited", async () => {
      // Парсер Ashby просить більше для свого API: дошки віддають усе разом з
      // описами одним запитом (src/server/parsers/README.md, «Ashby»).
      respond = (_request, response) => {
        response.writeHead(200);
        response.end("x".repeat(3072));
      };
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        maxBytes: 2048,
      });

      const allowed = await client.get("https://site.test/big", {
        maxBytes: 4096,
      });
      const error = await errorOf(client.get("https://site.test/big"));

      expect(allowed.body).toHaveLength(3072);
      expect(error).toMatchObject({ reason: "too-large" });
    });
  });

  describe("retries", () => {
    /** `sleep`, що не чекає, а записує, скільки його просили чекати. */
    function recordingSleep() {
      const pauses: number[] = [];
      return {
        pauses,
        sleep: async (ms: number) => {
          pauses.push(ms);
        },
      };
    }

    /** Відповідає статусами по черзі, останнім - на всі наступні запити. */
    function statuses(...codes: number[]): typeof respond {
      let call = 0;
      return (_request, response) => {
        const code = codes[Math.min(call, codes.length - 1)] ?? 200;
        call += 1;
        response.writeHead(code);
        response.end(String(code));
      };
    }

    it("retries a server error twice with a growing pause", async () => {
      respond = statuses(500, 503, 200);
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const response = await client.get("https://site.test/flaky");

      expect(response.status).toBe(200);
      expect(pauses).toEqual([1000, 2000]);
    });

    it("retries as many times as it is told", async () => {
      // RETRY_ATTEMPTS=1: одна повторна спроба з першою паузою, далі - відповідь
      // як є.
      respond = statuses(500, 503, 200);
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
        retryAttempts: 1,
      });

      const response = await client.get("https://site.test/flaky");

      expect(response.status).toBe(503);
      expect(pauses).toEqual([1000]);
    });

    it("does not retry at all with zero retries", async () => {
      respond = statuses(500, 200);
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
        retryAttempts: 0,
      });

      const response = await client.get("https://site.test/flaky");

      expect(response.status).toBe(500);
      expect(pauses).toEqual([]);
    });

    it("returns the last server error when it does not go away", async () => {
      respond = statuses(500);
      const { sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const response = await client.get("https://site.test/down");

      expect(response.status).toBe(500);
      expect(received).toHaveLength(3);
    });

    it("does not retry a missing page", async () => {
      respond = statuses(404);
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const response = await client.get("https://site.test/gone");

      expect(response.status).toBe(404);
      expect(received).toHaveLength(1);
      expect(pauses).toEqual([]);
    });

    it("retries a dropped connection", async () => {
      let call = 0;
      respond = (_request, response) => {
        call += 1;
        if (call === 1) {
          response.socket?.destroy();
          return;
        }
        response.writeHead(200);
        response.end("back");
      };
      const { sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const response = await client.get("https://site.test/dropped");

      expect(response.body).toBe("back");
    });

    it("reports a network failure that does not go away", async () => {
      respond = (_request, response) => {
        response.socket?.destroy();
      };
      const { sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const error = await errorOf(client.get("https://site.test/dead"));

      expect(error).toMatchObject({ reason: "network" });
      expect(received).toHaveLength(3);
    });

    it("does not retry what a retry cannot fix", async () => {
      respond = (_request, response) => {
        response.writeHead(200, { "content-length": "10000" });
        response.flushHeaders();
      };
      const { sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        maxBytes: 2048,
        sleep,
      });

      const error = await errorOf(client.get("https://site.test/big"));

      expect(error).toMatchObject({ reason: "too-large" });
      expect(received).toHaveLength(1);
    });
  });

  describe("429 Too Many Requests", () => {
    /** Спершу 429 із заголовками, далі - 200. */
    function limitedOnce(headers: Record<string, string>): typeof respond {
      let call = 0;
      return (_request, response) => {
        call += 1;
        if (call === 1) {
          response.writeHead(429, headers);
          response.end();
          return;
        }
        response.writeHead(200);
        response.end("ok");
      };
    }

    function recordingSleep() {
      const pauses: number[] = [];
      return {
        pauses,
        sleep: async (ms: number) => {
          pauses.push(ms);
        },
      };
    }

    it("waits as many seconds as Retry-After asks", async () => {
      respond = limitedOnce({ "retry-after": "5" });
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const response = await client.get("https://site.test/busy");

      expect(response.status).toBe(200);
      expect(pauses).toEqual([5000]);
    });

    it("waits until the date Retry-After names", async () => {
      const now = Date.UTC(2026, 10, 18, 12, 0, 0);
      respond = limitedOnce({
        "retry-after": new Date(now + 7000).toUTCString(),
      });
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
        now: () => now,
      });

      await client.get("https://site.test/busy");

      expect(pauses).toEqual([7000]);
    });

    it("gives up at once when the site asks to wait longer than a minute", async () => {
      respond = limitedOnce({ "retry-after": "120" });
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const error = await errorOf(client.get("https://site.test/busy"));

      expect(error).toMatchObject({ reason: "rate-limited" });
      expect(pauses).toEqual([]);
    });

    it("gives up when 429 comes without Retry-After", async () => {
      respond = limitedOnce({});
      const { sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const error = await errorOf(client.get("https://site.test/busy"));

      expect(error).toMatchObject({ reason: "rate-limited" });
      expect(received).toHaveLength(1);
    });

    it("stops waiting after the second 429 in a row", async () => {
      respond = (_request, response) => {
        response.writeHead(429, { "retry-after": "1" });
        response.end();
      };
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({
        fakeOrigin: origin,
        limiter: noLimits,
        sleep,
      });

      const error = await errorOf(client.get("https://site.test/busy"));

      expect(error).toMatchObject({ reason: "rate-limited" });
      expect(pauses).toEqual([1000, 1000]);
      expect(received).toHaveLength(3);
    });
  });

  it("sends every attempt through the host limiter", async () => {
    let call = 0;
    respond = (request, response) => {
      call += 1;
      if (request.url === "/site.test/old") {
        redirect("https://jobs.test/new")(response);
        return;
      }
      // Перша спроба нової адреси - 500, друга - успіх.
      response.writeHead(call === 2 ? 500 : 200);
      response.end();
    };
    const hosts: string[] = [];
    const recording: HostLimiter = {
      run: (host, task) => {
        hosts.push(host);
        return task();
      },
    };
    const client = createHttpClient({
      fakeOrigin: origin,
      limiter: recording,
      sleep: async () => {},
    });

    await client.get("https://site.test/old");

    expect(hosts).toEqual(["site.test", "jobs.test", "jobs.test"]);
  });

  describe("real transport", () => {
    /** DNS, у якому `site.test` веде на задану адресу. */
    function resolvingTo(address: string): LookupFunction {
      return (_hostname, options, callback) => {
        if (options.all) {
          callback(null, [{ address, family: 4 }]);
        } else {
          callback(null, address, 4);
        }
      };
    }

    it("goes straight to the address without a fake origin", async () => {
      const port = new URL(origin).port;
      const client = createHttpClient({
        limiter: noLimits,
        lookup: resolvingTo("127.0.0.1"),
      });

      const response = await client.get(`http://site.test:${port}/direct`);

      expect(response.body).toBe("hello");
      expect(received.map((request) => request.url)).toEqual(["/direct"]);
    });

    it("treats a host the DNS check refuses as blocked and does not retry", async () => {
      const pauses: number[] = [];
      const client = createHttpClient({
        limiter: noLimits,
        lookup: createSafeLookup(async () => [
          { address: "10.0.0.1", family: 4 },
        ]),
        sleep: async (ms) => {
          pauses.push(ms);
        },
      });

      const error = await errorOf(client.get("http://site.test/admin"));

      expect(error).toMatchObject({ reason: "blocked" });
      expect(pauses).toEqual([]);
    });
  });

  it("accepts a fake origin only on this machine", () => {
    for (const fakeOrigin of [
      "http://10.0.0.1:4010",
      "http://fake.example.com",
      "not an address",
    ]) {
      expect(() => createHttpClient({ fakeOrigin }), fakeOrigin).toThrow(
        /FAKE_WEB_ORIGIN/,
      );
    }

    for (const fakeOrigin of [
      "http://127.0.0.1:4010",
      "http://[::1]:4010",
      "http://localhost:4010",
    ]) {
      expect(() => createHttpClient({ fakeOrigin }), fakeOrigin).not.toThrow();
    }
  });

  it("does not touch the network for an address checkUrl refuses", async () => {
    const client = createHttpClient({ fakeOrigin: origin, limiter: noLimits });

    const error = await errorOf(client.get("http://192.168.1.1/router"));

    expect(error).toMatchObject({ reason: "blocked" });
    expect(received).toHaveLength(0);
  });
});
