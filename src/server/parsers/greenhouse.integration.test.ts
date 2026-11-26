import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readGreenhouse } from "./greenhouse.ts";

/** The request schedule is not tested here - it has its own tests. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

/** The fake web server with real saved responses. */
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

/** A client that goes to the given server instead of real sites. */
function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 100,
  });
}

/** A separate server with one response - for cases the saved ones do not have. */
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

describe("readGreenhouse", () => {
  it("reads the vacancies of a real board", async () => {
    const result = await readGreenhouse(
      "https://job-boards.greenhouse.io/discord",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(26);
  });

  it("reports a board that does not exist", async () => {
    const result = await readGreenhouse(
      "https://job-boards.greenhouse.io/no-such-board",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address that is not a Greenhouse board", async () => {
    const result = await readGreenhouse(
      "https://bosch.com/careers",
      // Nobody listens on port 1: if a request went out, it would be fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("reports an answer that is not JSON", async () => {
    await withServer(
      (response) => {
        response.writeHead(200);
        response.end("<html>maintenance</html>");
      },
      async (origin) => {
        const result = await readGreenhouse(
          "https://job-boards.greenhouse.io/discord",
          clientFor(origin),
        );

        expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
      },
    );
  });

  it("reports the status of any other unsuccessful answer", async () => {
    await withServer(
      (response) => {
        response.writeHead(403);
        response.end();
      },
      async (origin) => {
        const result = await readGreenhouse(
          "https://job-boards.greenhouse.io/discord",
          clientFor(origin),
        );

        expect(result).toEqual({
          ok: false,
          error: { reason: "bad-status", status: 403 },
        });
      },
    );
  });

  it("reports a failed request with its cause", async () => {
    await withServer(
      () => {
        // Silent - the client gives up on the timeout.
      },
      async (origin) => {
        const result = await readGreenhouse(
          "https://job-boards.greenhouse.io/discord",
          clientFor(origin),
        );

        expect(result).toEqual({
          ok: false,
          error: { reason: "fetch-failed", cause: "timeout" },
        });
      },
    );
  });
});
