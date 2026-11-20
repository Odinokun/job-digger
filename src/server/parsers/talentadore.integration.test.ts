import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readTalentAdore } from "./talentadore.ts";

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

function client(origin = fakeWeb.origin) {
  return createHttpClient({
    fakeOrigin: origin,
    limiter: noLimits,
    sleep: async () => {},
    timeoutMs: 1000,
  });
}

describe("readTalentAdore", () => {
  it("reads the positions of a real company from the widget address", async () => {
    const result = await readTalentAdore(
      "https://ats.talentadore.com/positions/rR1TqSR/json?v=2&language=",
      client(),
    );

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies.map((vacancy) => vacancy.title)).toEqual([
      "Join ELK Talent Community",
      "2D Game Artist",
      "Full Stack utvecklare",
    ]);
  });

  it("reports a token that does not exist", async () => {
    expect(
      await readTalentAdore(
        "https://ats.talentadore.com/positions/nobody/json",
        client(),
      ),
    ).toEqual({ ok: false, error: { reason: "not-found" } });
  });

  it("does not request anything for a job link", async () => {
    expect(
      await readTalentAdore(
        "https://ats.talentadore.com/apply/2d-game-artist/ZOjKN3",
        client("http://127.0.0.1:9"),
      ),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
