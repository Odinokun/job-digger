/**
 * Vacancies to check: the most vacancies a parser that reads a list in pages
 * (Lever, Workday, PeopleForce, Hurma) reads from one source, and how many pages
 * that is (tasks 3.12 and 6.16).
 *
 * The limit is in vacancies, not pages (the author's decision of 20.11.2026):
 * platforms have different page sizes - PeopleForce 10, Lever 100 - and the same
 * limit in pages gave 50 vacancies in one case and 500 in another.
 *
 * The limit is shared by all users and set by the `VACANCIES_TO_CHECK` variable
 * (`.env.example`). A wrong value is an error, not a silent default: otherwise a
 * mistake in `.env` would show only as fewer vacancies than there should be.
 * Next loads server modules lazily, so the error appears when the server first
 * takes the check module - at the latest on the first Check now. `npm run build`
 * does not catch it (checked in 3.12).
 */

/** The default value - the author's decision of 20.11.2026. */
export const DEFAULT_VACANCIES_TO_CHECK = 500;

/**
 * The largest allowed value - a guard against a mistake in `.env`. Requests to
 * one site have a 2 s pause between them, so 1000 PeopleForce vacancies are 100
 * pages, over 3 minutes per source; more would run into the 10 minutes after
 * which the queue considers a task stuck (`src/server/queue/README.md`).
 */
export const MAX_VACANCIES_TO_CHECK = 1000;

/**
 * How much to read: only the first page or up to the limit. Who reads what:
 * `src/server/checks/README.md`, "Read depth".
 */
export type ReadDepth = "first-page" | "full";

/** The value of the `VACANCIES_TO_CHECK` variable; empty means the default. */
export function parseVacanciesToCheck(raw: string | undefined): number {
  const value = raw?.trim() ?? "";

  if (value === "") {
    return DEFAULT_VACANCIES_TO_CHECK;
  }

  const count = Number(value);

  if (!/^\d+$/.test(value) || count < 1 || count > MAX_VACANCIES_TO_CHECK) {
    throw new Error(
      `VACANCIES_TO_CHECK must be a whole number from 1 to ${MAX_VACANCIES_TO_CHECK}, got: ${raw}`,
    );
  }

  return count;
}

/** The app's limit. */
export const VACANCIES_TO_CHECK = parseVacanciesToCheck(
  process.env.VACANCIES_TO_CHECK,
);

/**
 * How many pages to read. Rounded up: a limit of 250 with pages of 100 is three
 * pages, so as not to read less than the limit promises.
 */
export function pagesToRead({
  pageSize,
  depth,
  limit = VACANCIES_TO_CHECK,
}: {
  pageSize: number;
  depth: ReadDepth;
  limit?: number;
}): number {
  return depth === "first-page" ? 1 : Math.ceil(limit / pageSize);
}
