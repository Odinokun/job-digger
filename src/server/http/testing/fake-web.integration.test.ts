import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFakeWeb, type FakeWeb } from "./fake-web.ts";

describe("fake web server", () => {
  // `base/responses` - тека відповідей, `base/secret.txt` - файл поза нею.
  let base: string;
  let fakeWeb: FakeWeb;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), "fake-web-"));
    const root = join(base, "responses");
    await mkdir(join(root, "boards-api.greenhouse.io/v1/boards/acme"), {
      recursive: true,
    });
    await writeFile(
      join(root, "boards-api.greenhouse.io/v1/boards/acme/jobs"),
      '{"jobs":[],"meta":{"total":0}}',
    );
    await writeFile(join(base, "secret.txt"), "outside of the responses");

    fakeWeb = await startFakeWeb({ root, port: 0 });
  });

  afterAll(async () => {
    await fakeWeb.close();
    await rm(base, { recursive: true, force: true });
  });

  it("serves the saved response for the host and path", async () => {
    const response = await fetch(
      `${fakeWeb.origin}/boards-api.greenhouse.io/v1/boards/acme/jobs`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobs: [], meta: { total: 0 } });
  });

  it("ignores the query string", async () => {
    const response = await fetch(
      `${fakeWeb.origin}/boards-api.greenhouse.io/v1/boards/acme/jobs?content=true`,
    );

    expect(response.status).toBe(200);
  });

  it("answers 404 when nothing is saved for the path", async () => {
    const response = await fetch(
      `${fakeWeb.origin}/boards-api.greenhouse.io/v1/boards/missing/jobs`,
    );

    expect(response.status).toBe(404);
  });

  it("refuses paths that climb out of the responses folder", async () => {
    // Сирий запит: fetch нормалізує `..` і `%2e%2e` ще до відправки, а
    // `%2f` - закодований слеш, який URL не вважає межею сегмента. Після
    // декодування це `/../secret.txt`, і зупинити його може лише сервер.
    expect(await rawStatus(fakeWeb.origin, "/..%2fsecret.txt")).toBe(404);
  });
});

/** Статус відповіді на запит із шляхом рівно таким, як переданий. */
function rawStatus(origin: string, path: string): Promise<number> {
  const { hostname, port } = new URL(origin);

  return new Promise((done, fail) => {
    request({ hostname, port, path }, (response) => {
      response.resume();
      done(response.statusCode ?? 0);
    })
      .on("error", fail)
      .end();
  });
}
