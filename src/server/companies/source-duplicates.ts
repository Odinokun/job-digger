import { and, eq, inArray, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { normalizeCompanyUrl } from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";

/** Компанія, яку треба назвати у відмові: більшого інтерфейсу не потрібно. */
export type CompanyWithSource = {
  id: string;
  name: string;
};

export type FindCompanyWithSourceInput = {
  userId: string;
  /** Очищена адреса джерела - та сама форма, що лежить у `normalized_url`. */
  normalizedUrl: string;
  /**
   * Компанія, якій джерело саме додають. Її власні джерела дублікатом *між*
   * компаніями не є: їх ловить `prepareCareerSource` і каже про це інакше.
   */
  exceptCompanyId?: string;
};

/**
 * Компанія того самого користувача, яка вже має це карʼєрне джерело, або `null`.
 *
 * Потрібна відтоді, як компанія може не мати головного сайту (картка 2.17):
 * тоді її більше нічим не відрізнити від такої самої, і друге додавання
 * `jobs.lever.co/spotify` дало б двох «Spotify» із подвійними перевірками.
 *
 * **Перевірка дружня, а не атомарна.** Unique-індексу на джерелах немає:
 * `career_sources` не має `user_id`, а унікальність у межах користувача одним
 * індексом по одній таблиці не виражається - PostgreSQL не вміє unique через
 * join. Денормалізувати `user_id` заради цього не стали: ціна - колонка,
 * складений FK і індекс, а купується атомарність проти гонки «два одночасні
 * Save», яка коштує один зайвий рядок, що прибирається кнопкою Remove. Те саме
 * рішення вже ухвалене для дублікатів усередині компанії
 * ([`lib/companies/career-source.ts`](../../lib/companies/career-source.ts)).
 *
 * Виклик іде всередині транзакції того, хто вставляє джерело: між перевіркою і
 * вставкою компанію могли б видалити.
 *
 * Запит іде через `companies` з умовою на користувача: `career_sources` власника
 * не зберігає, а без цієї умови відмова розказувала б про чужу компанію.
 */
export async function findCompanyWithSource(
  db: NodePgDatabase,
  { userId, normalizedUrl, exceptCompanyId }: FindCompanyWithSourceInput,
): Promise<CompanyWithSource | null> {
  const [row] = await db
    .select({ id: companies.id, name: companies.name })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(
      and(
        eq(companies.userId, userId),
        eq(careerSources.normalizedUrl, normalizedUrl),
        exceptCompanyId === undefined
          ? undefined
          : ne(companies.id, exceptCompanyId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export type FindCompaniesWithSourcesInput = {
  userId: string;
  /** Адреси як є, наприклад знахідки Find pages: очищаються тут. */
  urls: string[];
};

/**
 * Для кожної адреси, яка вже є джерелом якоїсь компанії користувача, - ця
 * компанія (задача 5.08: «вже відстежується в ...» у списку знахідок).
 *
 * Ключ - адреса так, як її передали, а не очищена: викликач шукає знахідку
 * саме за нею. Один запит на весь список замість `findCompanyWithSource` на
 * кожну адресу. Непридатна адреса просто не має пари - джерелом вона бути не
 * може.
 */
export async function findCompaniesWithSources(
  db: NodePgDatabase,
  { userId, urls }: FindCompaniesWithSourcesInput,
): Promise<Map<string, CompanyWithSource>> {
  const byNormalized = new Map<string, string[]>();
  for (const url of urls) {
    const normalized = normalizeCompanyUrl(url);
    if (normalized.ok) {
      byNormalized.set(normalized.url, [
        ...(byNormalized.get(normalized.url) ?? []),
        url,
      ]);
    }
  }

  const found = new Map<string, CompanyWithSource>();
  if (byNormalized.size === 0) {
    return found;
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      normalizedUrl: careerSources.normalizedUrl,
    })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(
      and(
        eq(companies.userId, userId),
        inArray(careerSources.normalizedUrl, [...byNormalized.keys()]),
      ),
    );

  for (const { id, name, normalizedUrl } of rows) {
    for (const url of byNormalized.get(normalizedUrl) ?? []) {
      found.set(url, { id, name });
    }
  }

  return found;
}
