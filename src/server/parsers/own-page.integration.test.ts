import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpClient } from "../http/client.ts";
import type { HostLimiter } from "../http/host-limiter.ts";
import { startFakeWeb, type FakeWeb } from "../http/testing/fake-web.ts";
import { readOwnPage } from "./own-page.ts";
import { readSource } from "./read-source.ts";

/** Розклад запитів тут не перевіряється - він має власні тести. */
const noLimits: HostLimiter = { run: (_host, task) => task() };

const KINGGROUP = "https://kinggroup.io/vacancies/tech";
const RECIPE = "kinggroup.io/vacancies/design/";

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

describe("readOwnPage", () => {
  it("reads the vacancies of a real company page by its recipe", async () => {
    const result = await readOwnPage(KINGGROUP, RECIPE, client());

    expect(result).toMatchObject({ ok: true, skipped: 0 });
    if (!result.ok) return;
    expect(result.vacancies).toHaveLength(10);
    expect(result.vacancies).toContainEqual({
      externalId: null,
      title: "Frontend Developer",
      url: "https://kinggroup.io/vacancies/design/frontend-developer",
      location: null,
    });
    // Пагінації немає - список повний.
    expect(result.truncated).toBeUndefined();
  });

  it("fails rather than reporting no vacancies when the recipe finds nothing", async () => {
    // Сайт переробили: нуль вакансій - збій, а не закриття всіх (6.21).
    expect(
      await readOwnPage(KINGGROUP, "kinggroup.io/careers/", client()),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });

  it("reports a page that is gone", async () => {
    expect(
      await readOwnPage(
        "https://kinggroup.io/vacancies/gone",
        RECIPE,
        client(),
      ),
    ).toEqual({ ok: false, error: { reason: "not-found" } });
  });
});

describe("readSource for an own page", () => {
  it("reads it by the recipe of the source", async () => {
    const result = await readSource(
      { url: KINGGROUP, platform: "own_page", vacancyLinkPrefix: RECIPE },
      client(),
    );

    expect(result).toMatchObject({ ok: true });
  });

  it("calls an own page without a recipe unreadable", async () => {
    // Так не буває: рецепт і платформа пишуться разом. Але колонка може бути
    // `null`, і тоді читати нічим.
    expect(
      await readSource(
        { url: KINGGROUP, platform: "own_page", vacancyLinkPrefix: null },
        client(),
      ),
    ).toEqual({ ok: false, error: { reason: "unreadable" } });
  });
});
