/**
 * Модуль HTTP-запитів: єдиний шлях, яким сервер ходить на чужі сайти
 * (src/server/http/README.md).
 *
 * Транспорт - `node:http` / `node:https`, а не глобальний `fetch`: тільки сюди
 * можна передати власну функцію `lookup` і перевіряти адреси з DNS у момент
 * зʼєднання (`safeLookup` у ssrf.ts).
 */
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import { createHostLimiter, type HostLimiter } from "./host-limiter.ts";
import { checkUrl, safeLookup } from "./ssrf.ts";

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
  /** Поточний час у мс - для `Retry-After` у форматі дати й обмежувача. */
  now?: () => number;
  /**
   * Скільки повторів після збою: 0-2 (`RETRY_ATTEMPTS`, `retry-attempts.ts`).
   * За замовчуванням - усі паузи з `RETRY_PAUSES_MS`, тобто два.
   */
  retryAttempts?: number;
  /**
   * Розклад запитів до хостів. За замовчуванням - `MAX_PER_HOST` одночасно і
   * `GAP_PER_HOST_MS` між стартами. Один клієнт - один розклад, тож ліміт діє на
   * всі запити, що йдуть через нього.
   */
  limiter?: HostLimiter;
  /**
   * DNS для справжніх запитів. За замовчуванням `safeLookup` - перевірка адрес у
   * момент зʼєднання. Тести передають свій, щоб пройти справжнім шляхом без мережі.
   */
  lookup?: LookupFunction;
}

/** Не більше двох запитів одночасно до одного сайту. */
export const MAX_PER_HOST = 2;

/** Щонайменше 2 с між стартами запитів до одного сайту. */
export const GAP_PER_HOST_MS = 2000;

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

/** Налаштування одного запиту. */
export interface RequestOptions {
  /**
   * Ліміт розміру саме цього запиту замість спільного. Для відомих API, що
   * віддають усе одним запитом (Ashby), - не для довільних сайтів.
   */
  maxBytes?: number;
  /**
   * Додаткові заголовки саме цього запиту - для API, що без них не відповідає
   * (Hurma чекає `X-Requested-With`). Свій User-Agent і заголовки тіла клієнт
   * ставить сам, і замінити їх тут не можна.
   */
  headers?: Record<string, string>;
}

/** Налаштування, з якими йде один запит: клієнта плюс запиту. */
type SendOptions = HttpClientOptions & Pick<RequestOptions, "headers">;

/** Заголовки, які клієнт ставить сам, - у нижньому регістрі. */
const OWN_HEADERS = new Set(["user-agent", "content-type", "content-length"]);

export interface HttpClient {
  get(url: string, request?: RequestOptions): Promise<HttpResponse>;
  /**
   * POST з тілом JSON - для API, що віддають дані лише так (Workday). Редирект
   * не виконується, а повертається як відповідь: що він означає для API,
   * вирішує парсер. Решта - як у `get`: захист від SSRF, ліміти, повтори.
   */
  post(
    url: string,
    json: unknown,
    request?: RequestOptions,
  ): Promise<HttpResponse>;
}

/** Тіло запиту JSON; без нього запит - GET. */
type JsonBody = string | undefined;

/** Скільки переходів поспіль дозволено, перш ніж здатися. */
const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Паузи перед повторами - що далі, то довші. Повторів стільки, скільки пауз
 * бере `retryAttempts`: за замовчуванням два, тобто до трьох спроб на адресу.
 */
const RETRY_PAUSES_MS = [1000, 2000];

/** Найдовше очікування за `Retry-After`: на Vercel уся перевірка - 4,5 хв. */
const MAX_RETRY_AFTER_MS = 60_000;

/** Скільки разів поспіль на одну адресу чекаємо після 429. */
const MAX_RATE_LIMIT_WAITS = 2;

const realSleep = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, ms));

export function createHttpClient(options: HttpClientOptions): HttpClient {
  if (options.fakeOrigin !== undefined) {
    assertLoopback(options.fakeOrigin);
  }

  const limiter =
    options.limiter ??
    createHostLimiter({
      maxConcurrent: MAX_PER_HOST,
      gapMs: GAP_PER_HOST_MS,
      now: options.now ?? Date.now,
      sleep: options.sleep ?? realSleep,
    });

  /** Ліміт окремого запиту замість спільного. */
  function withRequest(request: RequestOptions): SendOptions {
    return {
      ...options,
      ...(request.maxBytes === undefined ? {} : { maxBytes: request.maxBytes }),
      ...(request.headers === undefined ? {} : { headers: request.headers }),
    };
  }

  return {
    async post(url, json, request = {}) {
      return sendWithRetries(
        allowedUrl(url),
        withRequest(request),
        limiter,
        JSON.stringify(json),
      );
    },

    async get(url, request = {}) {
      let current = allowedUrl(url);
      // Ліміт запиту діє й на редиректи - це та сама відповідь.
      const requestOptions = withRequest(request);

      // Редиректи - вручну, а не силами транспорту: кожна нова адреса має
      // пройти захист від SSRF до того, як на неї піде запит.
      for (let redirects = 0; ; redirects += 1) {
        const response = await sendWithRetries(
          current,
          requestOptions,
          limiter,
        );
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
  options: SendOptions,
  limiter: HostLimiter,
  json?: JsonBody,
): Promise<HttpResponse> {
  const sleep = options.sleep ?? realSleep;
  const now = options.now ?? Date.now;
  const pauses = RETRY_PAUSES_MS.slice(0, options.retryAttempts);
  let attempt = 0;
  let rateLimitWaits = 0;

  for (;;) {
    const pause = pauses[attempt];

    try {
      // Через обмежувач іде кожна спроба, а не лише перша: інакше повтор
      // після 500 одразу вдарив би по сайту вдруге.
      const response = await limiter.run(url.hostname, () =>
        send(url, options, json),
      );

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

  // Відмова `safeLookup`: домен веде на внутрішню адресу. Це заборона, а не
  // збій мережі - повтор нічого не змінить і лише постукає туди ще раз.
  if ((error as NodeJS.ErrnoException).code === "ERR_SSRF_PRIVATE_ADDRESS") {
    return new HttpError("blocked", url.toString(), (error as Error).message);
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

/**
 * Фейковий вебсервер дозволено лише на цій машині. Підміна пускає всі запити
 * повз захист від SSRF на одну адресу - тож змінна, що випадково потрапила в
 * продакшн, має зламати запуск, а не вести запити на чужий сервер.
 */
function assertLoopback(fakeOrigin: string): void {
  let host: string;

  try {
    host = new URL(fakeOrigin).hostname;
  } catch {
    host = "";
  }

  if (!["127.0.0.1", "[::1]", "localhost"].includes(host)) {
    throw new Error(
      `FAKE_WEB_ORIGIN must point to this machine (127.0.0.1, ::1 or localhost), got: ${fakeOrigin}`,
    );
  }
}

/** Заголовки запиту без тих, що клієнт ставить сам, у будь-якому регістрі. */
function extraHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !OWN_HEADERS.has(name.toLowerCase()),
    ),
  );
}

/** Один запит, без редиректів: GET або, з тілом `json`, POST. */
function send(
  logical: URL,
  options: SendOptions,
  json?: JsonBody,
): Promise<HttpResponse> {
  // З фейковим вебсервером - на нього, домен стає частиною шляху. Без нього -
  // на справжню адресу, і `safeLookup` перевіряє адреси з DNS у момент
  // зʼєднання. Фейковий сервер - loopback, тож `safeLookup` його б відхилив:
  // для нього перевірка DNS не потрібна, адресу задає не сайт, а ми.
  const fake = options.fakeOrigin !== undefined;
  const target = fake
    ? new URL(
        `/${logical.host}${logical.pathname}${logical.search}`,
        options.fakeOrigin,
      )
    : logical;
  const transport =
    !fake && target.protocol === "https:" ? httpsRequest : httpRequest;
  const url = logical.toString();
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_BYTES;

  return new Promise((done, fail) => {
    let refused = false;

    /**
     * Відмова з нашого боку - завелика відповідь. Відмовляємо самі, а не
     * чекаємо `error` від `request.destroy`: якщо відповідь уже прийшла
     * повністю, Node його не видає, а видає `end`.
     */
    function refuse(error: HttpError) {
      refused = true;
      clearTimeout(timer);
      request.destroy();
      fail(error);
    }

    const request = transport(
      target,
      {
        method: json === undefined ? "GET" : "POST",
        headers: {
          ...extraHeaders(options.headers),
          "user-agent": USER_AGENT,
          ...(json === undefined
            ? {}
            : {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(json),
              }),
        },
        ...(fake ? {} : { lookup: options.lookup ?? safeLookup }),
      },
      (res) => {
        // Заявлений розмір більший за ліміт - не читаємо тіло зовсім.
        if (Number(res.headers["content-length"]) > maxBytes) {
          refuse(tooLarge(url, maxBytes));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;

          // Обриваємо, щойно ліміт перевищено, а не після всього тіла:
          // нескінченна відповідь інакше тримала б зʼєднання до тайм-ауту.
          if (size > maxBytes) {
            refuse(tooLarge(url, maxBytes));
            return;
          }

          chunks.push(chunk);
        });
        res.on("end", () => {
          // Після відмови `end` усе одно приходить, якщо тіло вже доїхало, -
          // і дав би успіх з обрізаним тілом.
          if (refused) return;
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
    request.end(json);
  });
}

function tooLarge(url: string, maxBytes: number): HttpError {
  return new HttpError(
    "too-large",
    url,
    `Response from ${url} is larger than ${maxBytes} bytes`,
  );
}
