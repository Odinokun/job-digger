/**
 * Модуль HTTP-запитів: єдиний шлях, яким сервер ходить на чужі сайти
 * (docs/discovery-and-parsing.md, розділ 6, «Ввічливість до сайтів»).
 *
 * Транспорт - `node:http` / `node:https`, а не глобальний `fetch`: тільки сюди
 * можна передати власну функцію `lookup` і перевіряти адреси з DNS у момент
 * зʼєднання (`safeLookup` у ssrf.ts).
 */
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";

import { checkUrl } from "./ssrf.ts";

/** Чесне представлення: хто ходить на сайт і навіщо. */
export const USER_AGENT = "JobDigger/0.1 (personal job tracker)";

export interface HttpResponse {
  status: number;
  /** Логічна адреса відповіді - та, яку бачив би браузер, без підміни. */
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface HttpClientOptions {
  /**
   * Адреса фейкового вебсервера для тестів. Запит на `https://host/path` тоді
   * йде на `{fakeOrigin}/host/path` (src/server/http/testing/README.md).
   */
  fakeOrigin?: string;
}

export type HttpErrorReason =
  /** Захист від SSRF не пустив за адресою - на будь-якому кроці редиректу. */
  | "blocked"
  /** Більше ніж `MAX_REDIRECTS` переходів поспіль. */
  | "too-many-redirects";

/** Запит не вдався. `reason` - щоб парсер міг відрізнити причини. */
export class HttpError extends Error {
  readonly reason: HttpErrorReason;
  readonly url: string;

  constructor(reason: HttpErrorReason, url: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.reason = reason;
    this.url = url;
  }
}

export interface HttpClient {
  get(url: string): Promise<HttpResponse>;
}

/** Скільки переходів поспіль дозволено, перш ніж здатися. */
const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export function createHttpClient(options: HttpClientOptions): HttpClient {
  return {
    async get(url) {
      let current = allowedUrl(url);

      // Редиректи - вручну, а не силами транспорту: кожна нова адреса має
      // пройти захист від SSRF до того, як на неї піде запит.
      for (let redirects = 0; ; redirects += 1) {
        const response = await send(current, options);
        const location = response.headers.location;

        if (!REDIRECT_STATUSES.has(response.status) || !location) {
          return response;
        }

        if (redirects === MAX_REDIRECTS) {
          throw new HttpError(
            "too-many-redirects",
            current.toString(),
            `More than ${MAX_REDIRECTS} redirects starting from ${url}`,
          );
        }

        // Відносний `Location` рахується від поточної логічної адреси.
        current = allowedUrl(new URL(location, current).toString());
      }
    },
  };
}

/** Адреса, яку пропустив захист від SSRF, або `HttpError` "blocked". */
function allowedUrl(url: string): URL {
  const check = checkUrl(url);

  if (!check.ok) {
    throw new HttpError(
      "blocked",
      url,
      `Refused to request ${url}: ${check.reason}`,
    );
  }

  return check.url;
}

/** Один запит, без редиректів. */
function send(logical: URL, options: HttpClientOptions): Promise<HttpResponse> {
  const target = new URL(
    `/${logical.host}${logical.pathname}${logical.search}`,
    options.fakeOrigin,
  );

  return new Promise((done, fail) => {
    httpRequest(target, { headers: { "user-agent": USER_AGENT } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        done({
          status: res.statusCode ?? 0,
          url: logical.toString(),
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
      res.on("error", fail);
    })
      .on("error", fail)
      .end();
  });
}
