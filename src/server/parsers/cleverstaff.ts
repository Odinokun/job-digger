/**
 * Парсер CleverStaff (задача 3.25): вакансії з публічного API, яким
 * користується сама сторінка дошки `https://cleverstaff.net/i/{alias}-vacancies`.
 *
 * Документація (neo.cleverstaff.net/api.html) описує `getVacancies?alias=`, але
 * на дошку без вакансій він відповідає `notFound` - як на неіснуючу. Сторінка
 * дошки ходить на недокументований `getAllOpenVacancy?alias=`, і той для
 * порожньої дошки дає `ok` без вакансій. Перевірено справжніми запитами
 * 19.11.2026; деталі - src/server/parsers/README.md, «CleverStaff».
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

/** Дошка компанії - за аліасом, або окрема вакансія, аліас якої ще невідомий. */
export type CleverStaffSource = { alias: string } | { vacancy: string };

/**
 * Що в адресі джерела: дошка `/i/{alias}-vacancies` (зокрема її сторінка
 * `/description`) чи вакансія `/i/vacancy-{localId}`. Інше - `null`.
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

/** Адреса дошки компанії з аліасом. */
export function cleverstaffBoardUrl(alias: string): string {
  return `${ORIGIN}/i/${encodeURIComponent(alias)}-vacancies`;
}

/**
 * Вакансії з відповіді `getAllOpenVacancy`. API відповідає 200 і тоді, коли
 * дошки немає: помилку видно з `status: "error"` і `code`.
 *
 * `externalId` - `localId` (він же в адресі вакансії), назва - `position`,
 * локація - `displayFullName` кожного з `regions` (або `region`), для
 * віддаленої роботи (`workCondition: "remote"`) - з приміткою «remote».
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

  // Порожня дошка приходить зовсім без `objects` (дошка MEV, 19.11.2026).
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
 * Вакансії кар'єрного джерела на CleverStaff. Для посилання на окрему вакансію
 * спершу дізнається аліас компанії (`getVacancy`), потім читає всю дошку.
 * Адреса без дошки CleverStaff - `unreadable` без жодного запиту.
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
 * Аліас компанії з публічних даних вакансії. Вакансія, яку закрили чи
 * прибрали з публічної дошки, - `vacancyIsNotPublic`, тобто `not-found`.
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
