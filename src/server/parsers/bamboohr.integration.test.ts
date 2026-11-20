import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readBambooHr } from "./bamboohr.ts";

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

describe("readBambooHr", () => {
  it("reads the jobs of a real careers page from a job address", async () => {
    const result = await readBambooHr(
      "https://altenar.bamboohr.com/careers/88",
      clientFor(fakeWeb.origin),
    );

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(12);
  });

  it("calls a company BambooHR redirects to its own website not found", async () => {
    // Невідома компанія - не 404, а редирект на www.bamboohr.com з HTML.
    const server: Server = createServer((request, response) => {
      if (request.url?.startsWith("/nobody.bamboohr.com/")) {
        response.writeHead(302, { location: "https://www.bamboohr.com/" });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!DOCTYPE html><title>BambooHR</title>");
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

    try {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

      expect(
        await readBambooHr(
          "https://nobody.bamboohr.com/careers",
          clientFor(origin),
        ),
      ).toEqual({ ok: false, error: { reason: "not-found" } });
    } finally {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  });

  it("does not request anything for BambooHR's own website", async () => {
    expect(
      await readBambooHr(
        "https://www.bamboohr.com/careers",
        clientFor("http://127.0.0.1:9"),
      ),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
