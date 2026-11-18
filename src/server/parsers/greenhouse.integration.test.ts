import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readGreenhouse } from "./greenhouse.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

/** Фейковий вебсервер зі справжніми збереженими відповідями. */
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

/** Клієнт, що ходить на заданий сервер замість справжніх сайтів. */
function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 100,
  });
}

/** Окремий сервер з однією відповідью - для випадків, яких немає в збережених. */
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
      // Порт 1 ніхто не слухає: якби запит пішов, це був би fetch-failed.
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
        // Мовчить - клієнт здається за тайм-аутом.
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
