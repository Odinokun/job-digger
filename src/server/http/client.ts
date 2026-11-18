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
  /** Скільки чекати на всю відповідь. За замовчуванням `TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Найбільший розмір тіла в байтах. За замовчуванням `MAX_BYTES`. */
  maxBytes?: number;
}

/** 20 с на весь запит - від зʼєднання до останнього байта. */
export const TIMEOUT_MS = 20_000;

/**
 * 5 МБ. Найбільша відома дошка (Anthropic на Greenhouse, 658 вакансій) -
 * 471 КБ; ліміт захищає від гігантських і нескінченних відповідей.
 */
export const MAX_BYTES = 5 * 1024 * 1024;

export type HttpErrorReason =
  /** Захист від SSRF не пустив за адресою - на будь-якому кроці редиректу. */
  | "blocked"
  /** Більше ніж `MAX_REDIRECTS` переходів поспіль. */
  | "too-many-redirects"
  /** Відповідь не прийшла повністю за `timeoutMs`. */
  | "timeout"
  /** Тіло більше за `maxBytes` - заявлене чи фактичне. */
  | "too-large";

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
  const url = logical.toString();
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BYTES;

  return new Promise((done, fail) => {
    const request = httpRequest(
      target,
      { headers: { "user-agent": USER_AGENT } },
      (res) => {
        // Заявлений розмір більший за ліміт - не читаємо тіло зовсім.
        if (Number(res.headers["content-length"]) > maxBytes) {
          request.destroy(tooLarge(url, maxBytes));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;

          // Обриваємо, щойно ліміт перевищено, а не після всього тіла:
          // нескінченна відповідь інакше тримала б зʼєднання до тайм-ауту.
          if (size > maxBytes) {
            request.destroy(tooLarge(url, maxBytes));
            return;
          }

          chunks.push(chunk);
        });
        res.on("end", () => {
          clearTimeout(timer);
          done({
            status: res.statusCode ?? 0,
            url,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    // Тайм-аут на весь запит, а не на тишу в сокеті: сайт, що віддає по байту
    // на секунду, інакше тримав би запит як завгодно довго.
    const timer = setTimeout(() => {
      request.destroy(
        new HttpError(
          "timeout",
          url,
          `No complete response from ${url} in ${timeoutMs} ms`,
        ),
      );
    }, timeoutMs);

    request.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });
    request.end();
  });
}

function tooLarge(url: string, maxBytes: number): HttpError {
  return new HttpError(
    "too-large",
    url,
    `Response from ${url} is larger than ${maxBytes} bytes`,
  );
}
