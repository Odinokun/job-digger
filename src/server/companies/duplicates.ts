import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
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
 * Компанія, знайдена за назвою. Окремо від `ConflictingCompany`: сюди
 * потрапляють і компанії без головного сайту - саме через них це попередження
 * й зʼявилося (картка 2.17), тому `url` тут необовʼязковий.
 */
export type NamedCompany = {
  id: string;
  name: string;
  url: string | null;
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
        // Компанія без сайту не конфліктує по сайту ні з ким (картка 2.17).
        // Умова на домен нижче відсіяла б її й сама - `NULL = ...` не
        // істинне, - але сказати це прямо чесніше, ніж покластися на побічний
        // ефект тричевої логіки.
        isNotNull(companies.normalizedUrl),
        // Домен обчислюється в SQL, а не шукається через `like 'bosch.com%'`:
        // інакше bosch.com.ua вважався б тим самим доменом, що bosch.com.
        sql`split_part(split_part(${companies.normalizedUrl}, '/', 1), '?', 1) = ${domain}`,
      ),
    )
    // Порядок задає код, а не база: попередження перелічує компанії домену
    // так само, як їх показує список компаній - за назвою.
    .orderBy(asc(companies.name));

  // Звуження типу: запит уже відсіяв рядки без адреси, але знати про це
  // компілятор не може - колонки в схемі nullable.
  const withUrl = rows.filter(
    (
      row,
    ): row is {
      id: string;
      name: string;
      url: string;
      normalizedUrl: string;
    } => row.url !== null && row.normalizedUrl !== null,
  );

  const exact = withUrl.find((row) => row.normalizedUrl === normalizedUrl);

  if (exact) {
    return { kind: "exact", company: withoutNormalizedUrl(exact) };
  }

  if (withUrl.length > 0) {
    return {
      kind: "same-domain",
      companies: withUrl.map(withoutNormalizedUrl),
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
 * Потрібні відтоді, як сайт став необовʼязковим (картка 2.17): дві картки
 * однієї компанії можуть не мати спільної адреси взагалі - в однієї лише сайт
 * `linear.com`, в іншої лише сторінка `jobs.ashbyhq.com/linear`. Перевірка по
 * сайту порівнює сайт із сайтом, перевірка по джерелу - джерело з джерелом, і
 * жодна з них такої пари не бачить. Спільним лишається тільки те, що
 * застосунок вивів з обох адрес ту саму назву.
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
