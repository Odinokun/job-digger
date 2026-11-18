/**
 * Вибір парсера за платформою джерела: одна точка, через яку перевірка читає
 * будь-яке джерело.
 */
import type { CareerPlatform } from "../../lib/companies/platform.ts";
import type { HttpClient } from "../http/client.ts";
import { readGreenhouse } from "./greenhouse.ts";
import type { ParseResult } from "./types.ts";

type Reader = (sourceUrl: string, client: HttpClient) => Promise<ParseResult>;

/**
 * Парсери, які вже є. Платформа без парсера тут відсутня, а не заглушка з
 * помилкою: джерело, яке нічим прочитати, - не невдала перевірка, а ще не
 * зроблена (решта парсерів - задачі 3.07-3.11).
 */
const READERS: Partial<Record<CareerPlatform, Reader>> = {
  greenhouse: readGreenhouse,
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
