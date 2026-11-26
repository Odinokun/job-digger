import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readSoftgarden } from "./softgarden.ts";

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

function clientFor(origin: string) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

describe("readSoftgarden", () => {
  it("reads the jobs of a real old board from a job link", async () => {
    const result = await readSoftgarden(
      "https://dps.softgarden.io/job/17623206/x?l=en",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(19);
    expect(result.ok && result.vacancies[0]?.url).toBe(
      "https://dps.softgarden.io/job/63432734/Java-Developer-m-w-d-",
    );
  });

  it("reads the jobs of a real career site from its feed", async () => {
    const result = await readSoftgarden(
      "https://spinncloud.career.softgarden.de/en/",
      clientFor(fakeWeb.origin),
    );

    expect(result.ok && result.vacancies).toHaveLength(6);
  });

  it("reports an old board that does not exist", async () => {
    const result = await readSoftgarden(
      "https://no-such-company.softgarden.io/en/vacancies",
      clientFor(fakeWeb.origin),
    );

    expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("reports a career site that does not exist, though it answers 400", async () => {
    // Like the real one (checked 19.11.2026): an unknown site is a 400, not a 404.
    const server: Server = createServer((_request, response) => {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        '{"success":false,"errorMessage":"No such client for domain no-such.career.softgarden.de"}',
      );
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

    try {
      const result = await readSoftgarden(
        "https://no-such.career.softgarden.de/",
        clientFor(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
      );

      expect(result).toEqual({ ok: false, error: { reason: "not-found" } });
    } finally {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
  });

  it("does not request anything for an address that is not softgarden", async () => {
    const result = await readSoftgarden(
      "https://www.softgarden.io/",
      // Nobody listens on port 1: if a request went out, it would be fetch-failed.
      clientFor("http://127.0.0.1:1"),
    );

    expect(result).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
