import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { sameCompanyName } from "../../lib/companies/name.ts";
import { companies } from "../db/schema.ts";

/** Компанія в тому вигляді, в якому про неї треба сказати користувачеві. */
export type ConflictingCompany = {
  id: string;
  name: string;
  url: string;
};

/**
 * Компанія, знайдена за назвою. Окремо від `ConflictingCompany`: попередження
 * про назву ловить ту саму компанію під іншим сайтом (картка 2.17).
 */
export type NamedCompany = {
  id: string;
  name: string;
  url: string;
};

/**
 * Що знайшлося серед уже доданих компаній користувача.
 *
 * `exact` блокує додавання, `same-domain` - лише попередження: на тому самому
 * домені може бути кілька різних компаній, наприклад національних версій
 * (src/lib/companies/README.md).
 */
export type CompanyUrlConflict =
  | { kind: "none" }
  | { kind: "exact"; company: ConflictingCompany }
  | { kind: "same-domain"; companies: ConflictingCompany[] };

/**
 * Шукає конфлікт для адреси, яку користувач хоче додати.
 *
 * Шукається лише серед компаній цього користувача: дані ізольовані, тому чужа
 * компанія з такою ж адресою конфліктом не є.
 */
export async function findCompanyUrlConflict(
  db: NodePgDatabase,
  { userId, normalizedUrl }: { userId: string; normalizedUrl: string },
): Promise<CompanyUrlConflict> {
  const domain = companyUrlDomain(normalizedUrl);

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      url: companies.url,
      normalizedUrl: companies.normalizedUrl,
    })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
        // Домен обчислюється в SQL, а не шукається через `like 'bosch.com%'`:
        // інакше bosch.com.ua вважався б тим самим доменом, що bosch.com.
        sql`split_part(split_part(${companies.normalizedUrl}, '/', 1), '?', 1) = ${domain}`,
      ),
    )
    // Порядок задає код, а не база: попередження перелічує компанії домену
    // так само, як їх показує список компаній - за назвою.
    .orderBy(asc(companies.name));

  const exact = rows.find((row) => row.normalizedUrl === normalizedUrl);

  if (exact) {
    return { kind: "exact", company: withoutNormalizedUrl(exact) };
  }

  if (rows.length > 0) {
    return {
      kind: "same-domain",
      companies: rows.map(withoutNormalizedUrl),
    };
  }

  return { kind: "none" };
}

/** Домен адреси: усе до першого слеша або знака питання. */
function companyUrlDomain(normalizedUrl: string): string {
  return normalizedUrl.split("/")[0].split("?")[0];
}

function withoutNormalizedUrl({
  id,
  name,
  url,
}: ConflictingCompany & { normalizedUrl: string }): ConflictingCompany {
  return { id, name, url };
}

/**
 * Компанії користувача з такою самою назвою.
 *
 * Зʼявились разом із компаніями без сайту (картка 2.17) і лишились: дві картки
 * однієї компанії можуть не мати спільної адреси - сайти на різних доменах
 * (`linear.app` і `linear.io`), джерела різні. Перевірка по сайту й по
 * джерелу таку пару не бачать; спільною лишається тільки назва.
 *
 * Це **попередження, а не заборона**: дві різні компанії цілком можуть
 * називатися однаково, і рішення лишається за користувачем - як і зі спільним
 * доменом.
 *
 * **Порівняння йде в коді, а не в SQL.** Правило («Rolls-Royce», «Rolls Royce»
 * і «RollsRoyce» - одна компанія) живе в
 * [`lib/companies/name.ts`](../../lib/companies/name.ts) поруч із тим кодом,
 * що назву й виводить, а не дублюється виразом `regexp_replace`: до того ж
 * POSIX-класи Postgres по-різному поводяться з не-латиницею залежно від
 * локалі бази. Ціна - читання кількох сотень коротких рядків раз на додавання
 * компанії. Якщо список виросте настільки, що це стане помітним, додамо
 * збережену колонку з індексом - так само, як зробили з адресами.
 */
export async function findCompaniesByName(
  db: NodePgDatabase,
  { userId, name }: { userId: string; name: string },
): Promise<NamedCompany[]> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      url: companies.url,
    })
    .from(companies)
    .where(eq(companies.userId, userId))
    // Порядок задає код, а не база: попередження перелічує компанії так само,
    // як їх показує список.
    .orderBy(asc(companies.name));

  return rows.filter((row) => sameCompanyName(row.name, name));
}
