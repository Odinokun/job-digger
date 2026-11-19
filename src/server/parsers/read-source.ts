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
import { readLever } from "./lever.ts";
import { readPeopleForce } from "./peopleforce.ts";
import type { ParseResult } from "./types.ts";
import { readWorkday } from "./workday.ts";

type Reader = (sourceUrl: string, client: HttpClient) => Promise<ParseResult>;

/**
 * Парсери, які вже є. Платформа без парсера тут відсутня, а не заглушка з
 * помилкою: джерело, яке нічим прочитати, - не невдала перевірка, а ще не
 * зроблена (schema.org - задача 3.11).
 */
const READERS: Partial<Record<CareerPlatform, Reader>> = {
  greenhouse: readGreenhouse,
  ashby: readAshby,
  lever: (sourceUrl, client) => readLever(sourceUrl, client),
  workday: (sourceUrl, client) => readWorkday(sourceUrl, client),
  peopleforce: (sourceUrl, client) => readPeopleForce(sourceUrl, client),
  breezy: readBreezy,
  cleverstaff: readCleverStaff,
};

/**
 * Вакансії джерела або `null`, якщо для платформи ще немає парсера.
 */
export async function readSource(
  source: { url: string; platform: CareerPlatform },
  client: HttpClient,
): Promise<ParseResult | null> {
  const reader = READERS[source.platform];

  return reader === undefined ? null : reader(source.url, client);
}
