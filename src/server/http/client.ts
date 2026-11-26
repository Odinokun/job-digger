/**
 * The HTTP request module: the only way the server reaches other websites
 * (src/server/http/README.md).
 *
 * The transport is `node:http` / `node:https`, not the global `fetch`: only
 * these accept a custom `lookup` function, which checks DNS addresses at
 * connection time (`safeLookup` in ssrf.ts).
 */
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import { createHostLimiter, type HostLimiter } from "./host-limiter.ts";
import { checkUrl, safeLookup } from "./ssrf.ts";

/** An honest User-Agent: who visits the site and why. */
export const USER_AGENT = "JobDigger/0.1 (personal job tracker)";

export interface HttpResponse {
  status: number;
  /** The logical address of the response - the one a browser would see, unswapped. */
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface HttpClientOptions {
  /**
   * The fake web server's address for tests. A request to `https://host/path`
   * then goes to `{fakeOrigin}/host/path` (src/server/http/testing/README.md).
   */
  fakeOrigin?: string;
  /** How long to wait for the whole response. Defaults to `TIMEOUT_MS`. */
  timeoutMs?: number;
  /** The largest body size in bytes. Defaults to `MAX_BYTES`. */
  maxBytes?: number;
  /** The pause between attempts. Tests pass their own so they don't wait real seconds. */
  sleep?: (ms: number) => Promise<void>;
  /** The current time in ms - for a date-format `Retry-After` and the limiter. */
  now?: () => number;
  /**
   * How many retries after a failure: 0-2 (`RETRY_ATTEMPTS`, `retry-attempts.ts`).
   * Defaults to all the pauses in `RETRY_PAUSES_MS`, that is two.
   */
  retryAttempts?: number;
  /**
   * The schedule of requests to hosts. Defaults to `MAX_PER_HOST` at once and
   * `GAP_PER_HOST_MS` between starts. One client has one schedule, so the limit
   * covers every request that goes through it.
   */
  limiter?: HostLimiter;
  /**
   * DNS for real requests. Defaults to `safeLookup`, which checks addresses at
   * connection time. Tests pass their own to take the real path without a network.
   */
  lookup?: LookupFunction;
}

/** At most two requests at once to one site. */
export const MAX_PER_HOST = 2;

/** At least 2 s between the starts of requests to one site. */
export const GAP_PER_HOST_MS = 2000;

/** 20 s for the whole request - from connecting to the last byte. */
export const TIMEOUT_MS = 20_000;

/**
 * 5 MB. The largest known board (Anthropic on Greenhouse, 658 vacancies) is
 * 471 KB; the limit protects against giant and endless responses.
 */
export const MAX_BYTES = 5 * 1024 * 1024;

export type HttpErrorReason =
  /** SSRF protection refused the address - at any step of a redirect. */
  | "blocked"
  /** More than `MAX_REDIRECTS` hops in a row. */
  | "too-many-redirects"
  /** The response did not arrive in full within `timeoutMs`. */
  | "timeout"
  /** The body is larger than `maxBytes` - declared or actual. */
  | "too-large"
  /** A network failure (dropped or refused connection) that persisted after retries. */
  | "network"
  /**
   * The site answered 429 and asks to wait longer than `MAX_RETRY_AFTER_MS`,
   * does not say how long, or still answers 429 after two waits.
   */
  | "rate-limited";

/** The request failed. `reason` lets a parser tell the causes apart. */
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

/** Settings of a single request. */
export interface RequestOptions {
  /**
   * A size limit for this request instead of the shared one. For known APIs
   * that return everything in one request (Ashby), not for arbitrary sites.
   */
  maxBytes?: number;
  /**
   * Extra headers for this request - for APIs that do not answer without them
   * (Hurma expects `X-Requested-With`). The client sets its own User-Agent and
   * body headers, and they cannot be replaced here.
   */
  headers?: Record<string, string>;
}

/** The settings one request runs with: the client's plus the request's. */
type SendOptions = HttpClientOptions & Pick<RequestOptions, "headers">;

/** Headers the client sets itself, in lower case. */
const OWN_HEADERS = new Set(["user-agent", "content-type", "content-length"]);

export interface HttpClient {
  get(url: string, request?: RequestOptions): Promise<HttpResponse>;
  /**
   * POST with a JSON body - for APIs that only return data this way (Workday).
   * A redirect is not followed but returned as the response: the parser decides
   * what it means for the API. The rest is as in `get`: SSRF protection, limits,
   * retries.
   */
  post(
    url: string,
    json: unknown,
    request?: RequestOptions,
  ): Promise<HttpResponse>;
}

/** The JSON request body; without it the request is a GET. */
type JsonBody = string | undefined;

/** How many hops in a row are allowed before giving up. */
const MAX_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Pauses before retries, each longer than the last. There are as many retries
 * as `retryAttempts` takes pauses: two by default, so up to three attempts per URL.
 */
const RETRY_PAUSES_MS = [1000, 2000];

/** The longest `Retry-After` wait: on Vercel the whole check gets 4.5 min. */
const MAX_RETRY_AFTER_MS = 60_000;

/** How many times in a row we wait after a 429 for one URL. */
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

  /** A per-request limit instead of the shared one. */
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
      // The request's limit covers redirects too - it is the same response.
      const requestOptions = withRequest(request);

      // Redirects are followed by hand, not by the transport: every new address
      // has to pass SSRF protection before a request goes to it.
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

        // A relative `Location` resolves against the current logical address.
        current = allowedUrl(new URL(location, current).toString());
      }
    },
  };
}

/**
 * A request with retries: only on a network failure, a timeout or a server
 * error (5xx), that is when the next attempt really can succeed. A 4xx response
 * (404 included) is returned at once: the parser decides what to do with it.
 * An SSRF refusal, an oversized response and redirect loops are not retried
 * either - a retry would not change them.
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
      // Every attempt goes through the limiter, not just the first: otherwise a
      // retry after a 500 would hit the site a second time right away.
      const response = await limiter.run(url.hostname, () =>
        send(url, options, json),
      );

      // 429 is handled apart from ordinary retries: the site says how long to
      // wait, and these waits do not use up the retries meant for failures.
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
 * How many ms `Retry-After` asks to wait: a number of seconds or an HTTP date
 * (https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3). `null` means the
 * header is missing or cannot be parsed.
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

/** A transport failure becomes a "network" `HttpError`; our own errors stay as they are. */
function asHttpError(error: unknown, url: URL): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  // A `safeLookup` refusal: the domain points at an internal address. This is a
  // ban, not a network failure - a retry changes nothing and only knocks again.
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

/** The address SSRF protection let through, or a "blocked" `HttpError`. */
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
 * The fake web server is allowed only on this machine. The override sends every
 * request past SSRF protection to one address, so a variable that slips into
 * production must break the start, not send requests to someone else's server.
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

/** Request headers without the ones the client sets itself, in any case. */
function extraHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !OWN_HEADERS.has(name.toLowerCase()),
    ),
  );
}

/** One request, without redirects: GET or, with a `json` body, POST. */
function send(
  logical: URL,
  options: SendOptions,
  json?: JsonBody,
): Promise<HttpResponse> {
  // With the fake web server, the request goes to it and the domain becomes part
  // of the path. Without it, the request goes to the real address, and
  // `safeLookup` checks DNS addresses at connection time. The fake server is on
  // loopback, so `safeLookup` would refuse it: it needs no DNS check, because we
  // set its address, not the site.
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
     * A refusal on our side - the response is too large. We refuse ourselves
     * rather than wait for `error` from `request.destroy`: if the response has
     * already arrived in full, Node emits `end` instead of it.
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
        // The declared size is over the limit - don't read the body at all.
        if (Number(res.headers["content-length"]) > maxBytes) {
          refuse(tooLarge(url, maxBytes));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        res.on("data", (chunk: Buffer) => {
          size += chunk.length;

          // Abort as soon as the limit is exceeded, not after the whole body:
          // an endless response would otherwise hold the connection until the timeout.
          if (size > maxBytes) {
            refuse(tooLarge(url, maxBytes));
            return;
          }

          chunks.push(chunk);
        });
        res.on("end", () => {
          // After a refusal `end` still arrives if the body has already come in,
          // and would give a success with a truncated body.
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

    // A timeout for the whole request, not for silence on the socket: a site that
    // sends a byte a second would otherwise hold the request for as long as it likes.
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
