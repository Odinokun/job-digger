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
  /** Пауза між спробами. Тести передають свою, щоб не чекати справжні секунди. */
  sleep?: (ms: number) => Promise<void>;
  /** Поточний час у мс - для `Retry-After` у форматі дати. */
  now?: () => number;
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
  | "too-large"
  /** Збій мережі (обрив, відмова в зʼєднанні), що не минув і після повторів. */
  | "network"
  /**
   * Сайт відповів 429 і просить чекати довше за `MAX_RETRY_AFTER_MS`, не каже
   * скільки, або відповідає 429 і після двох очікувань.
   */
  | "rate-limited";

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

/**
 * Паузи перед повторами - що далі, то довші. Повторів стільки, скільки пауз:
 * два, тобто до трьох спроб на адресу.
 */
const RETRY_PAUSES_MS = [1000, 2000];

/** Найдовше очікування за `Retry-After`: на Vercel уся перевірка - 4,5 хв. */
const MAX_RETRY_AFTER_MS = 60_000;

/** Скільки разів поспіль на одну адресу чекаємо після 429. */
const MAX_RATE_LIMIT_WAITS = 2;

const realSleep = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, ms));

export function createHttpClient(options: HttpClientOptions): HttpClient {
  return {
    async get(url) {
      let current = allowedUrl(url);

      // Редиректи - вручну, а не силами транспорту: кожна нова адреса має
      // пройти захист від SSRF до того, як на неї піде запит.
      for (let redirects = 0; ; redirects += 1) {
        const response = await sendWithRetries(current, options);
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

/**
 * Запит із повторами: лише при збої мережі, тайм-ауті й помилці сервера (5xx) -
 * тобто коли наступна спроба справді може вдатися. Відповідь 4xx (зокрема 404)
 * повертається одразу: що з нею робити, вирішує парсер. Заборона SSRF, завелика
 * відповідь і зациклені редиректи теж не повторюються - повтор їх не змінить.
 */
async function sendWithRetries(
  url: URL,
  options: HttpClientOptions,
): Promise<HttpResponse> {
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  let attempt = 0;
  let rateLimitWaits = 0;

  for (;;) {
    const pause = RETRY_PAUSES_MS[attempt];

    try {
      const response = await send(url, options);

      // 429 - окремо від звичайних повторів: сайт сам каже, скільки чекати,
      // і ці очікування не зʼїдають повтори на випадок збою.
      if (response.status === 429) {
        const wait = retryAfterMs(response.headers["retry-after"], now());

        if (
          wait === null ||
          wait > MAX_RETRY_AFTER_MS ||
          rateLimitWaits === MAX_RATE_LIMIT_WAITS
        ) {
          throw new HttpError(
            "rate-limited",
            url.toString(),
            `${url} answered 429 (Retry-After: ${response.headers["retry-after"] ?? "none"})`,
          );
        }

        rateLimitWaits += 1;
        await sleep(wait);
        continue;
      }

      if (response.status < 500 || pause === undefined) {
        return response;
      }
    } catch (error) {
      const failure = asHttpError(error, url);

      if (!isRetryable(failure) || pause === undefined) {
        throw failure;
      }
    }

    attempt += 1;
    await sleep(pause);
  }
}

/**
 * Скільки мс просить чекати `Retry-After`: число секунд або дата HTTP
 * (https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3). `null` - заголовка
 * немає або його не розібрати.
 */
function retryAfterMs(header: string | undefined, now: number): number | null {
  if (header === undefined) {
    return null;
  }

  if (/^\d+$/.test(header.trim())) {
    return Number(header.trim()) * 1000;
  }

  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function isRetryable(error: HttpError): boolean {
  return error.reason === "network" || error.reason === "timeout";
}

/** Збій транспорту стає `HttpError` "network", наші помилки лишаються як є. */
function asHttpError(error: unknown, url: URL): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  const detail = error instanceof Error ? error.message : String(error);
  return new HttpError(
    "network",
    url.toString(),
    `Request to ${url} failed: ${detail}`,
  );
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
