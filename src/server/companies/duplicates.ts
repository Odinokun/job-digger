import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { companies } from "../db/schema.ts";

/** Компанія в тому вигляді, в якому про неї треба сказати користувачеві. */
export type ConflictingCompany = {
  id: string;
  name: string;
  url: string;
};

/**
 * Що знайшлося серед уже доданих компаній користувача.
 *
 * `exact` блокує додавання, `same-domain` - лише попередження: на тому самому
 * домені може бути кілька різних компаній, наприклад національних версій
 * (docs/discovery-and-parsing.md, розділ 5).
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
