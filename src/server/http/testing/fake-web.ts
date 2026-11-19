/**
 * Фейковий вебсервер: замінює в тестах справжні платформи й сайти компаній.
 *
 * Запит `/{домен}/{шлях}` віддається файлом `{root}/{домен}/{шлях}` - так у
 * тестах можна зберігати справжні відповіді платформ і віддавати їх застосунку,
 * не ходячи в мережу. Рядок запиту ігнорується: відповідь визначає лише шлях.
 * Шлях, що закінчується на `/`, віддається файлом `index` у цій теці.
 *
 * Слухає лише 127.0.0.1, як і сам застосунок.
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve, sep } from "node:path";

export interface FakeWeb {
  /** Адреса сервера без кінцевого `/`, наприклад `http://127.0.0.1:4010`. */
  origin: string;
  close(): Promise<void>;
}

interface FakeWebOptions {
  /** Тека зі збереженими відповідями. */
  root: string;
  /** Порт; 0 - вільний порт на вибір системи. */
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
 * Файл для шляху запиту або `null`, якщо шлях виходить за межі `rootDir`.
 *
 * Шлях декодується до перевірки: інакше закодоване `%2e%2e` проскочило б
 * перевірку і стало б `..` уже у файловій системі.
 */
function responseFile(rootDir: string, requestUrl: string): string | null {
  const pathname = new URL(requestUrl, "http://fake").pathname;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  // Шлях на `/` - тека, а її вміст лежить у файлі `index`: так віддається
  // корінь сайту компанії (`/acme.example/`).
  const path = decoded.endsWith("/") ? `${decoded}index` : decoded;
  const file = resolve(rootDir, `.${path}`);
  return file.startsWith(rootDir + sep) ? file : null;
}

async function readOptional(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch {
    // Немає файлу, або це тека - для тесту однаково «відповіді немає».
    return null;
  }
}

/**
 * Тип вмісту за першим значущим символом. Розширень у файлів часто немає:
 * назва файлу повторює шлях платформи (`.../jobs`), а не тип відповіді.
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
