import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, USER_AGENT } from "./client.ts";

/**
 * Локальний сервер, якому тест сам задає відповіді. Клієнт іде на нього через
 * підміну адреси: просить `https://site.test/...`, а потрапляє на
 * `{origin}/site.test/...` - так само, як застосунок у тестах іде на фейковий
 * вебсервер. Захист від SSRF при цьому перевіряє справжню, логічну адресу.
 */
let server: Server;
let origin: string;
let lastRequest: IncomingMessage | undefined;

beforeAll(async () => {
  server = createServer((request, response) => {
    lastRequest = request;
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("hello");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((done) => server.close(done));
});

describe("createHttpClient", () => {
  it("gets a page through the fake origin and reports the logical address", async () => {
    const client = createHttpClient({ fakeOrigin: origin });

    const response = await client.get("https://site.test/careers?team=eng");

    expect(response).toMatchObject({
      status: 200,
      url: "https://site.test/careers?team=eng",
      body: "hello",
    });
    expect(lastRequest?.url).toBe("/site.test/careers?team=eng");
  });

  it("introduces itself with an honest User-Agent", async () => {
    const client = createHttpClient({ fakeOrigin: origin });

    await client.get("https://site.test/");

    expect(lastRequest?.headers["user-agent"]).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/^JobDigger\//);
  });
});
