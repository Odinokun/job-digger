/**
 * The app's only HTTP client. Every outgoing request goes through it: the
 * schedule of requests to sites belongs to the client, and only a shared client
 * keeps the "two at once, 2 s between starts" limit for the whole app rather
 * than for everyone who created their own.
 *
 * Only tests set `FAKE_WEB_ORIGIN` (Playwright passes it to the app): then every
 * request goes to the fake web server. The variable must point at this machine,
 * otherwise the client is not created (src/server/http/README.md).
 */
import { createHttpClient } from "./client.ts";
import { parseRetryAttempts } from "./retry-attempts.ts";

export const httpClient = createHttpClient({
  fakeOrigin: process.env.FAKE_WEB_ORIGIN || undefined,
  retryAttempts: parseRetryAttempts(process.env.RETRY_ATTEMPTS),
});
