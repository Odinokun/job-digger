import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createHttpClient, HttpError, USER_AGENT } from "./client.ts";

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
    const client = createHttpClient({ fakeOrigin: origin });

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
    const client = createHttpClient({ fakeOrigin: origin });

    await client.get("https://site.test/");

    expect(received[0]?.headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^JobDigger\//);
  });

  describe("redirects", () => {
    it("follows a redirect and reports the final address", async () => {
      respond = routes({
        "/site.test/old": redirect("https://site.test/new", 301),
        "/site.test/new": ok("moved here"),
      });
      const client = createHttpClient({ fakeOrigin: origin });

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
      const client = createHttpClient({ fakeOrigin: origin });

      const response = await client.get("https://site.test/jobs/old");

      expect(response.url).toBe("https://site.test/careers");
    });

    it("refuses a redirect to an internal address without requesting it", async () => {
      respond = routes({
        "/site.test/trap": redirect("http://127.0.0.1/admin"),
      });
      const client = createHttpClient({ fakeOrigin: origin });

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
      const client = createHttpClient({ fakeOrigin: origin });

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
        maxBytes: 2048,
      });

      const response = await client.get("https://site.test/edge");

      expect(response.body).toHaveLength(2048);
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
      const client = createHttpClient({ fakeOrigin: origin, sleep });

      const response = await client.get("https://site.test/flaky");

      expect(response.status).toBe(200);
      expect(pauses).toEqual([1000, 2000]);
    });

    it("returns the last server error when it does not go away", async () => {
      respond = statuses(500);
      const { sleep } = recordingSleep();
      const client = createHttpClient({ fakeOrigin: origin, sleep });

      const response = await client.get("https://site.test/down");

      expect(response.status).toBe(500);
      expect(received).toHaveLength(3);
    });

    it("does not retry a missing page", async () => {
      respond = statuses(404);
      const { pauses, sleep } = recordingSleep();
      const client = createHttpClient({ fakeOrigin: origin, sleep });

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
      const client = createHttpClient({ fakeOrigin: origin, sleep });

      const response = await client.get("https://site.test/dropped");

      expect(response.body).toBe("back");
    });

    it("reports a network failure that does not go away", async () => {
      respond = (_request, response) => {
        response.socket?.destroy();
      };
      const { sleep } = recordingSleep();
      const client = createHttpClient({ fakeOrigin: origin, sleep });

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
        maxBytes: 2048,
        sleep,
      });

      const error = await errorOf(client.get("https://site.test/big"));

      expect(error).toMatchObject({ reason: "too-large" });
      expect(received).toHaveLength(1);
    });
  });

  it("does not touch the network for an address checkUrl refuses", async () => {
    const client = createHttpClient({ fakeOrigin: origin });

    const error = await errorOf(client.get("http://192.168.1.1/router"));

    expect(error).toMatchObject({ reason: "blocked" });
    expect(received).toHaveLength(0);
  });
});
