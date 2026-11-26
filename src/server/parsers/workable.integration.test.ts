import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readWorkable } from "./workable.ts";

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

function client() {
  return createHttpClient({
    fakeOrigin: fakeWeb.origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

describe("readWorkable", () => {
  it("reads the jobs of a real account from its careers page address", async () => {
    const result = await readWorkable(
      "https://apply.workable.com/goreel/",
      client(),
    );

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies.map((vacancy) => vacancy.title)).toEqual([
      "Senior Automation QA Engineer (Python)",
      "Senior Cloud Delivery Engineer",
      "Senior Python Developer",
    ]);
  });

  it("reads the same account from a job link with capitals", async () => {
    // The API is case-sensitive (`GoReel` is a 404), and accounts are lower case.
    const result = await readWorkable(
      "https://apply.workable.com/GoReel/j/CABF5A6E3A/",
      client(),
    );

    expect(result).toMatchObject({ ok: true });
  });

  it("reports an account that does not exist", async () => {
    expect(
      await readWorkable("https://apply.workable.com/nobody/", client()),
    ).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for an address without an account", async () => {
    // A client without the fake server: the request would fail with a network error.
    const offline = createHttpClient({
      fakeOrigin: "http://127.0.0.1:9",
      limiter: noLimits,
      sleep: async () => {},
      timeoutMs: 100,
    });

    expect(
      await readWorkable("https://apply.workable.com/j/CABF5A6E3A", offline),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
