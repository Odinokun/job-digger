/**
 * Parallel source checks: how many sources are checked at the same time
 * (src/server/http/README.md). The limit is shared by all users and all
 * processes - the claim in the database holds it (`claim.ts`).
 *
 * It is set by the `PARALLEL_SOURCE_CHECKS` variable (`.env.example`). An invalid
 * value is an error, not a quiet default, as with `VACANCIES_TO_CHECK`: the queue
 * loop starts together with the server, so the error stops the start instead of
 * hiding.
 */

/** At most 5 sources at once ([CLAUDE.md](../../../CLAUDE.md#architecture)). */
export const DEFAULT_PARALLEL_CHECKS = 5;

/** The upper bound of the range (1-10). */
export const MAX_PARALLEL_CHECKS = 10;

/** The value of the `PARALLEL_SOURCE_CHECKS` variable; empty means the default. */
export function parseParallelChecks(raw: string | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") {
    return DEFAULT_PARALLEL_CHECKS;
  }

  const checks = Number(value);

  if (!/^\d+$/.test(value) || checks < 1 || checks > MAX_PARALLEL_CHECKS) {
    throw new Error(
      `PARALLEL_SOURCE_CHECKS must be a whole number from 1 to ${MAX_PARALLEL_CHECKS}, got: ${raw}`,
    );
  }

  return checks;
}
