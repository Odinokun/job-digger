/**
 * Третій, найменш надійний спосіб пошуку: дошки ATS за назвою компанії
 * (docs/discovery-and-parsing.md, розділ 5, пункт 3). Такі знахідки - лише
 * «знайдено за назвою - перевір»: та сама назва дошки може належати іншій
 * компанії.
 */

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import type { HttpClient } from "../http/client.ts";
import { readSource } from "../parsers/read-source.ts";
import type { BoardUrl } from "./board-url.ts";

/**
 * Адреса дошки з назвою `slug` на кожній платформі, яку можна вгадати. Workday
 * тут немає: в його адресі є номер кластера й назва сайту
 * (`nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite`).
 */
const BOARD_BY_SLUG: Array<[CareerPlatform, (slug: string) => string]> = [
  ["greenhouse", (slug) => `https://job-boards.greenhouse.io/${slug}`],
  ["lever", (slug) => `https://jobs.lever.co/${slug}`],
  ["ashby", (slug) => `https://jobs.ashbyhq.com/${slug}`],
  ["peopleforce", (slug) => `https://${slug}.peopleforce.io/careers`],
  ["breezy", (slug) => `https://${slug}.breezy.hr`],
];

/** Дошка, знайдена за назвою, і скільки на ній вакансій зараз. */
export type BoardByName = BoardUrl & { vacancies: number };

/** Мітки хоста, що не є назвою компанії: `www.acme.com`, `careers.acme.com`. */
const SERVICE_LABELS = new Set([
  "www",
  "careers",
  "career",
  "jobs",
  "karriere",
]);

/**
 * Варіанти назви дошки з назви компанії й адреси її сайту, без повторів.
 *
 * - назва разом (`boschua`) і, якщо слів кілька, через дефіс (`bosch-ua`):
 *   платформи пишуть назву дошки однією з цих форм;
 * - перша мітка домену (`bosch` з `bosch.de/ua`), пропускаючи службові
 *   (`www`, `careers`).
 *
 * Діакритика знімається, усе, крім латинських літер і цифр, - роздільник. Назва
 * без латиниці («Монобанк») варіантів не дає.
 */
export function nameSlugs({
  name,
  siteUrl,
}: {
  name: string;
  siteUrl: string | null;
}): string[] {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const slugs = [words.join("")];
  if (words.length > 1) {
    slugs.push(words.join("-"));
  }
  if (siteUrl !== null) {
    slugs.push(domainLabel(siteUrl));
  }

  return [...new Set(slugs.filter((slug) => slug.length >= 2))];
}

function domainLabel(siteUrl: string): string {
  const labels = new URL(siteUrl).hostname.split(".");
  return labels.find((label) => !SERVICE_LABELS.has(label)) ?? "";
}

/**
 * Дошки, що існують під однією з назв `nameSlugs`, - у порядку варіантів назви,
 * а для кожного - платформ.
 *
 * Чи є дошка, вирішує її читання тим самим парсером, що й у перевірці: на
 * неіснуючу дошку всі чотири платформи відповідають 404 (перевірено
 * 19.11.2026). Заодно відомо, скільки на дошці вакансій, - те, що показує
 * пробне читання (5.06). Будь-яка невдача - «дошки немає»: це вгадування, і
 * збій однієї платформи не робить невдалим увесь пошук.
 *
 * Запити йдуть паралельно: платформи - різні хости, а ліміт на хост і паузи
 * тримає HTTP-клієнт.
 */
export async function findBoardsByName(
  company: { name: string; siteUrl: string | null },
  client: HttpClient,
): Promise<BoardByName[]> {
  const candidates = nameSlugs(company).flatMap((slug) =>
    BOARD_BY_SLUG.map(([platform, urlOf]) => ({ platform, url: urlOf(slug) })),
  );

  const read = await Promise.all(
    candidates.map(async (board) => {
      const result = await readSource(board, client);
      return result?.ok
        ? { ...board, vacancies: result.vacancies.length }
        : null;
    }),
  );

  return read.filter((board) => board !== null);
}
