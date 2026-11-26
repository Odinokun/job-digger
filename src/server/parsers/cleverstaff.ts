/**
 * The CleverStaff parser (task 3.25): vacancies from the public API the board
 * page `https://cleverstaff.net/i/{alias}-vacancies` itself uses.
 *
 * The documentation (neo.cleverstaff.net/api.html) describes
 * `getVacancies?alias=`, but for a board without vacancies it answers `notFound`,
 * as for a missing one. The board page calls the undocumented
 * `getAllOpenVacancy?alias=`, which gives `ok` without vacancies for an empty
 * board. Checked with real requests on 19.11.2026; details in
 * src/server/parsers/README.md, "CleverStaff".
 */
import type { HttpClient } from "../http/client.ts";
import {
  collectVacancies,
  fetchJson,
  isRecord,
  UNREADABLE,
  type ReadVacancy,
} from "./shared.ts";
import type { ParseResult } from "./types.ts";

const ORIGIN = "https://cleverstaff.net";

/** A company board by alias, or a single vacancy whose alias is not known yet. */
export type CleverStaffSource = { alias: string } | { vacancy: string };

/**
 * What the source address holds: a board `/i/{alias}-vacancies` (including its
 * `/description` page) or a vacancy `/i/vacancy-{localId}`. Anything else is `null`.
 */
export function cleverstaffSource(sourceUrl: string): CleverStaffSource | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (url.hostname !== "cleverstaff.net") {
    return null;
  }

  const [section, page] = url.pathname.split("/").filter(Boolean);

  if (section !== "i" || page === undefined) {
    return null;
  }

  if (page.startsWith("vacancy-") && page.length > "vacancy-".length) {
    return { vacancy: page.slice("vacancy-".length) };
  }

  if (page.endsWith("-vacancies") && page.length > "-vacancies".length) {
    return { alias: page.slice(0, -"-vacancies".length) };
  }

  return null;
}

/** The address of a company board with an alias. */
export function cleverstaffBoardUrl(alias: string): string {
  return `${ORIGIN}/i/${encodeURIComponent(alias)}-vacancies`;
}

/**
 * Vacancies from the `getAllOpenVacancy` response. The API answers 200 even when
 * there is no board: the error shows in `status: "error"` and `code`.
 *
 * `externalId` is `localId` (the same as in the vacancy address), the title is
 * `position`, the location is the `displayFullName` of each of `regions` (or
 * `region`), with a "remote" note for remote work (`workCondition: "remote"`).
 */
export function parseCleverStaffVacancies(answer: unknown): ParseResult {
  if (!isRecord(answer)) {
    return UNREADABLE;
  }

  if (answer.status === "error") {
    return answer.code === "notFound"
      ? { ok: false, error: { reason: "not-found" } }
      : UNREADABLE;
  }

  if (answer.status !== "ok") {
    return UNREADABLE;
  }

  // An empty board comes without `objects` at all (the MEV board, 19.11.2026).
  if (answer.objects === undefined) {
    return { ok: true, vacancies: [], skipped: 0 };
  }

  if (!Array.isArray(answer.objects)) {
    return UNREADABLE;
  }

  return collectVacancies(answer.objects, toVacancy);
}

const toVacancy: ReadVacancy = (vacancy) => {
  const { localId, position } = vacancy;

  if (
    typeof localId !== "string" ||
    localId.trim() === "" ||
    typeof position !== "string"
  ) {
    return "broken";
  }

  if (position.trim() === "") {
    return "skip";
  }

  return {
    externalId: localId,
    title: position.trim(),
    url: `${ORIGIN}/i/vacancy-${encodeURIComponent(localId)}`,
    location: placeOf(vacancy),
  };
};

function placeOf(vacancy: Record<string, unknown>): string | null {
  const regions = Array.isArray(vacancy.regions)
    ? vacancy.regions
    : [vacancy.region];
  const places = regions
    .map((region) =>
      isRecord(region) && typeof region.displayFullName === "string"
        ? region.displayFullName.trim()
        : "",
    )
    .filter((place) => place !== "");
  const place = places.join("; ");
  const remote = vacancy.workCondition === "remote";

  if (place === "") {
    return remote ? "remote" : null;
  }

  return remote ? `${place}, remote` : place;
}

/**
 * Vacancies of a career source on CleverStaff. For a link to a single vacancy it
 * first learns the company alias (`getVacancy`), then reads the whole board. An
 * address without a CleverStaff board is `unreadable` without any request.
 */
export async function readCleverStaff(
  sourceUrl: string,
  client: HttpClient,
): Promise<ParseResult> {
  const source = cleverstaffSource(sourceUrl);

  if (source === null) {
    return UNREADABLE;
  }

  let alias: string;

  if ("alias" in source) {
    alias = source.alias;
  } else {
    const found = await aliasOfVacancy(source.vacancy, client);
    if (!found.ok) {
      return found;
    }
    alias = found.alias;
  }

  const fetched = await fetchJson(
    client,
    `${ORIGIN}/hr/public/getAllOpenVacancy?alias=${encodeURIComponent(alias)}&lang=en`,
  );

  return fetched.ok ? parseCleverStaffVacancies(fetched.answer) : fetched;
}

/**
 * The company alias from a vacancy's public data. A vacancy that was closed or
 * taken off the public board is `vacancyIsNotPublic`, that is `not-found`.
 */
async function aliasOfVacancy(
  localId: string,
  client: HttpClient,
): Promise<{ ok: true; alias: string } | Extract<ParseResult, { ok: false }>> {
  const fetched = await fetchJson(
    client,
    `${ORIGIN}/hr/public/getVacancy?host=&id=${encodeURIComponent(localId)}`,
  );

  if (!fetched.ok) {
    return fetched;
  }

  const { answer } = fetched;

  if (isRecord(answer) && answer.status === "error") {
    return answer.code === "vacancyIsNotPublic" || answer.code === "notFound"
      ? { ok: false, error: { reason: "not-found" } }
      : UNREADABLE;
  }

  const alias =
    isRecord(answer) && isRecord(answer.object) ? answer.object.alias : null;

  return typeof alias === "string" && alias !== ""
    ? { ok: true, alias }
    : UNREADABLE;
}
