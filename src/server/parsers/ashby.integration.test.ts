import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient, MAX_BYTES } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readAshby } from "./ashby.ts";

/** The request schedule is not tested here - it has its own tests. */
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

/** A client with the default shared size limit - as in the app. */
function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 5000,
  });
}

async function withServer(
  respond: (response: ServerResponse) => void,
  run: (origin: string) => Promise<void>,
) {
  const server: Server = createServer((_request, response) =>
    respond(response),
  );
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}

describe("readAshby", () => {
  it("reads the vacancies of a real board", async () => {
    const result = await readAshby(
      "https://jobs.ashbyhq.com/linear",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(33);
  });

  it("reports a board that does not exist", async () => {
    // The real Ashby answers 404 `Not Found` for an unknown board (checked
    // 18.11.2026), and so does the fake web server without a response.
    const result = await readAshby(
      "https://jobs.ashbyhq.com/no-such-board",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not an Ashby board", async () => {
    const result = await readAshby(
      "https://bosch.com/careers",
      // Nobody listens on port 1: if a request went out, it would be fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("reads a board larger than the usual response limit", async () => {
    // Ashby returns all vacancies with descriptions in one request: the OpenAI
    // board is 14 MB against the usual 5 MB limit. So the parser asks for more for its API.
    const description = "x".repeat(64 * 1024);
    const count = Math.ceil((MAX_BYTES * 1.5) / description.length);
    const board = {
      apiVersion: "1",
      jobs: Array.from({ length: count }, (_, i) => ({
        id: `job-${i}`,
        title: `Job ${i}`,
        jobUrl: `https://jobs.ashbyhq.com/acme/job-${i}`,
        location: "Remote",
        isListed: true,
        descriptionPlain: description,
      })),
    };

    await withServer(
      (response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(board));
      },
      async (origin) => {
        const result = await readAshby(
          "https://jobs.ashbyhq.com/acme",
          clientFor(origin),
        );

        expect(result.ok && result.vacancies).toHaveLength(count);
      },
    );
  });

  it("reports an answer that is not JSON", async () => {
    await withServer(
      (response) => {
        response.writeHead(200);
        response.end("<html>maintenance</html>");
      },
      async (origin) => {
        const result = await readAshby(
          "https://jobs.ashbyhq.com/acme",
          clientFor(origin),
        );

        expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
      },
    );
  });
});
