import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFakeWeb, type FakeWeb } from "./fake-web.ts";

describe("fake web server", () => {
  // `base/responses` is the responses folder, `base/secret.txt` a file outside it.
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
    await mkdir(join(root, "acme.example"));
    await writeFile(join(root, "acme.example/index"), "<html>Acme</html>");
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

  it("serves the index file for a path that ends with a slash", async () => {
    // The site root: the HTTP client turns `https://acme.example` into
    // `/acme.example/`, and a folder cannot be a file.
    const response = await fetch(`${fakeWeb.origin}/acme.example/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toBe("<html>Acme</html>");
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
    // A raw request: fetch normalises `..` and `%2e%2e` before sending, and
    // `%2f` is an encoded slash that URL does not treat as a segment boundary.
    // Decoded, it is `/../secret.txt`, and only the server can stop it.
    expect(await rawStatus(fakeWeb.origin, "/..%2fsecret.txt")).toBe(404);
  });
});

/** The status of a response to a request with exactly the given path. */
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
