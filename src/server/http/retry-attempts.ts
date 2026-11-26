/**
 * Retry attempts: how many retries after a network failure or a server error
 * (src/server/http/README.md). The HTTP client does the retries
 * (`client.ts`, `sendWithRetries`).
 *
 * Set by the `RETRY_ATTEMPTS` variable (`.env.example`). A wrong value is an
 * error, not a silent fallback to the default, as with `PARALLEL_SOURCE_CHECKS`:
 * the client is created when the server starts, so the error stops the start.
 */

/** The default value, which is also the upper bound: politeness allows no more. */
export const DEFAULT_RETRY_ATTEMPTS = 2;

export const MAX_RETRY_ATTEMPTS = 2;

/** The value of the `RETRY_ATTEMPTS` variable; empty means the default. */
export function parseRetryAttempts(raw: string | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") {
    return DEFAULT_RETRY_ATTEMPTS;
  }

  const attempts = Number(value);

  if (!/^\d+$/.test(value) || attempts > MAX_RETRY_ATTEMPTS) {
    throw new Error(
      `RETRY_ATTEMPTS must be a whole number from 0 to ${MAX_RETRY_ATTEMPTS}, got: ${raw}`,
    );
  }

  return attempts;
}
