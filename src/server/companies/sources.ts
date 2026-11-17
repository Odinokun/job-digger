import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { prepareCareerSource } from "../../lib/companies/career-source.ts";
import type { UrlRefusalReason } from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";

/** Яке джерело і якій компанії додаємо. */
export type AddCareerSourceInput = {
  userId: string;
  companyId: string;
  url: string;
  label?: string;
};

/**
 * Чим закінчилося додавання джерела.
 *
 * Відмови названі так само, як у `updateCompany`: модалки показують ті самі
 * тексти, а два набори назв для однієї дії розходилися б.
 */
export type AddCareerSourceResult =
  | { ok: true }
  | { ok: false; problem: "not-found" }
  | { ok: false; problem: "source-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "source-duplicate" };

/**
 * Додає карʼєрне джерело до вже доданої компанії.
 *
 * Потрібно там, де компанію не редагують: модалка Add company, упізнавши
 * вставлену адресу як уже додану компанію, пропонує зберегти цю адресу ще одним
 * джерелом замість глухої відмови (картка 2.16). Редагування компанії робить те
 * саме своїм Save - там джерело додається в одній транзакції з перейменуванням
 * і видаленнями (`update.ts`).
 *
 * Усе в транзакції, бо перевірка доступу й вставка - два запити: інакше між
 * ними компанію могли б видалити, і джерело лишилося б без неї.
 */
export async function addCareerSource(
  db: NodePgDatabase,
  { userId, companyId, url, label }: AddCareerSourceInput,
): Promise<AddCareerSourceResult> {
  return db.transaction(async (tx) => {
    const [company] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));

    // Відповідь однакова для неіснуючої та чужої компанії: інакше вона
    // підказувала б, що такий рядок у базі є.
    if (!company) {
      return { ok: false, problem: "not-found" };
    }

    const prepared = prepareCareerSource({
      url,
      label,
      existingUrls: (await companySources(tx, companyId)).map(
        (source) => source.url,
      ),
    });

    if (!prepared.ok) {
      return prepared.problem === "url"
        ? { ok: false, problem: "source-url", reason: prepared.reason }
        : { ok: false, problem: "source-duplicate" };
    }

    await tx.insert(careerSources).values({
      companyId,
      url: prepared.url,
      normalizedUrl: prepared.normalizedUrl,
      label: prepared.label,
      platform: prepared.platform,
      isTracked: prepared.isTracked,
    });

    return { ok: true };
  });
}

/**
 * Джерела компанії - id та адреса.
 *
 * Доступ тут не перевіряється: виклики спершу впевнюються, що компанія належить
 * користувачеві (`addCareerSource` - окремим запитом, `updateCompany` - умовою
 * самого `UPDATE`).
 */
export async function companySources(
  db: NodePgDatabase,
  companyId: string,
): Promise<Array<{ id: string; url: string }>> {
  return db
    .select({ id: careerSources.id, url: careerSources.url })
    .from(careerSources)
    .where(eq(careerSources.companyId, companyId));
}
