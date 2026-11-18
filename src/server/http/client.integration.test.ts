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

  it("does not touch the network for an address checkUrl refuses", async () => {
    const client = createHttpClient({ fakeOrigin: origin });

    const error = await errorOf(client.get("http://192.168.1.1/router"));

    expect(error).toMatchObject({ reason: "blocked" });
    expect(received).toHaveLength(0);
  });
});
