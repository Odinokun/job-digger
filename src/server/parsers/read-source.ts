/**
 * Вибір парсера за платформою джерела: одна точка, через яку перевірка читає
 * будь-яке джерело.
 */
import type { CareerPlatform } from "../../lib/companies/platform.ts";
import type { HttpClient } from "../http/client.ts";
import { readAshby } from "./ashby.ts";
import { readBreezy } from "./breezy.ts";
import { readCleverStaff } from "./cleverstaff.ts";
import { readGreenhouse } from "./greenhouse.ts";
import { readHurma } from "./hurma.ts";
import { readPersonio } from "./personio.ts";
import { readSoftgarden } from "./softgarden.ts";
import { readLever } from "./lever.ts";
import { readPeopleForce } from "./peopleforce.ts";
import type { ParseResult } from "./types.ts";
import type { ReadDepth } from "./vacancies-to-check.ts";
import { readWorkday } from "./workday.ts";

/**
 * Глибина (`depth`) потрібна лише парсерам, що читають сторінками; решта
 * віддає весь список одним запитом і її не бере.
 */
type Reader = (
  sourceUrl: string,
  client: HttpClient,
  depth: ReadDepth,
) => Promise<ParseResult>;

/**
 * Парсери, які вже є. Платформа без парсера тут відсутня, а не заглушка з
 * помилкою: джерело, яке нічим прочитати, - не невдала перевірка, а ще не
 * зроблена (schema.org - задача 3.11).
 */
const READERS: Partial<Record<CareerPlatform, Reader>> = {
  greenhouse: readGreenhouse,
  ashby: readAshby,
  lever: (sourceUrl, client, depth) => readLever(sourceUrl, client, { depth }),
  workday: (sourceUrl, client, depth) =>
    readWorkday(sourceUrl, client, { depth }),
  peopleforce: (sourceUrl, client, depth) =>
    readPeopleForce(sourceUrl, client, { depth }),
  breezy: readBreezy,
  cleverstaff: readCleverStaff,
  hurma: (sourceUrl, client, depth) => readHurma(sourceUrl, client, { depth }),
  personio: readPersonio,
  softgarden: readSoftgarden,
};

/**
 * Вакансії джерела або `null`, якщо для платформи ще немає парсера.
 */
export async function readSource(
  source: { url: string; platform: CareerPlatform },
  client: HttpClient,
  depth: ReadDepth = "full",
): Promise<ParseResult | null> {
  const reader = READERS[source.platform];

  return reader === undefined ? null : reader(source.url, client, depth);
}
