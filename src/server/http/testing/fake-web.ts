/**
 * The fake web server: replaces real platforms and company sites in tests.
 *
 * A request to `/{domain}/{path}` is served from the file `{root}/{domain}/{path}`,
 * so tests can keep real platform responses and serve them to the app without
 * going to the network. The query string is ignored: only the path decides the
 * response. A path ending in `/` is served from the `index` file in that folder.
 *
 * Listens on 127.0.0.1 only, like the app itself.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve, sep } from "node:path";

export interface FakeWeb {
  /** The server address without a trailing `/`, for example `http://127.0.0.1:4010`. */
  origin: string;
  close(): Promise<void>;
}

interface FakeWebOptions {
  /** The folder with saved responses. */
  root: string;
  /** The port; 0 lets the system pick a free one. */
  port: number;
}

export async function startFakeWeb({
  root,
  port,
}: FakeWebOptions): Promise<FakeWeb> {
  const rootDir = resolve(root);

  const server = createServer(async (request, response) => {
    const file = responseFile(rootDir, request.url ?? "/");
    const body = file === null ? null : await readOptional(file);

    if (body === null) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("No saved response for this path");
      return;
    }

    response.writeHead(200, { "content-type": contentType(body) });
    response.end(body);
  });

  await new Promise<void>((done) => server.listen(port, "127.0.0.1", done));
  const { port: actualPort } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${actualPort}`,
    close: () =>
      new Promise<void>((done, fail) =>
        server.close((error) => (error ? fail(error) : done())),
      ),
  };
}

/**
 * The file for a request path, or `null` if the path leaves `rootDir`.
 *
 * The path is decoded before the check: otherwise an encoded `%2e%2e` would slip
 * past it and become `..` in the file system.
 */
function responseFile(rootDir: string, requestUrl: string): string | null {
  const pathname = new URL(requestUrl, "http://fake").pathname;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  // A path ending in `/` is a folder, and its content is in the `index` file:
  // this is how a company site's root (`/acme.example/`) is served.
  const path = decoded.endsWith("/") ? `${decoded}index` : decoded;
  const file = resolve(rootDir, `.${path}`);
  return file.startsWith(rootDir + sep) ? file : null;
}

async function readOptional(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch {
    // No file, or it is a folder - for a test it is the same "no response".
    return null;
  }
}

/**
 * The content type by the first meaningful character. Files often have no
 * extension: the file name repeats the platform path (`.../jobs`), not the
 * response type.
 */
function contentType(body: Buffer): string {
  const first = body.toString("utf8").trimStart()[0];

  if (first === "{" || first === "[") {
    return "application/json";
  }

  if (first === "<") {
    return "text/html; charset=utf-8";
  }

  return "text/plain; charset=utf-8";
}
