import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  prepareCareerSource,
  type PreparedCareerSource,
} from "../../lib/companies/career-source.ts";
import type { UrlRefusalReason } from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";
import { withPagePlatform, type PagePlatforms } from "./page-platform.ts";
import {
  findCompanyWithSource,
  type CompanyWithSource,
} from "./source-duplicates.ts";

/** Яке джерело і якій компанії додаємо. */
export type AddCareerSourceInput = {
  userId: string;
  companyId: string;
  url: string;
  label?: string;
  /** Платформи, упізнані за вмістом сторінки (`platformsByPage`, задача 5.13). */
  pagePlatforms?: PagePlatforms;
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
  | { ok: false; problem: "source-duplicate" }
  /**
   * Це джерело вже належить іншій компанії того самого користувача. Окремо від
   * `source-duplicate`: там сторінка вже є в цієї ж компанії й видно її в
   * списку вище, а тут треба назвати, у кого вона (картка 2.17).
   */
  | { ok: false; problem: "source-taken"; company: CompanyWithSource };

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
  { userId, companyId, url, label, pagePlatforms }: AddCareerSourceInput,
): Promise<AddCareerSourceResult> {
  return addCareerSources(db, {
    userId,
    companyId,
    sources: [{ url, label }],
    pagePlatforms,
  });
}

/** Які джерела і якій компанії додаємо одним Save. */
export type AddCareerSourcesInput = {
  userId: string;
  companyId: string;
  sources: Array<{ url: string; label?: string }>;
  /** Платформи, упізнані за вмістом сторінки (`platformsByPage`, задача 5.13). */
  pagePlatforms?: PagePlatforms;
};

/**
 * Додає кілька карʼєрних джерел до вже доданої компанії - вибрані знахідки
 * Find pages на картці Not tracked (задача 5.14).
 *
 * Усе або нічого: спершу перевіряються всі адреси, і лише тоді вставка. Ранній
 * `return` із транзакції Drizzle - це commit, а не відкат, тож вставка посеред
 * перевірок лишила б половину джерел доданими.
 *
 * Та сама сторінка, записана двічі, - одне джерело, як і серед знахідок у
 * `addCompany`. А от сторінка, що вже є в самої компанії, - відмова
 * `source-duplicate`.
 */
export async function addCareerSources(
  db: NodePgDatabase,
  { userId, companyId, sources, pagePlatforms }: AddCareerSourcesInput,
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

    const existingUrls = (await companySources(tx, companyId)).map(
      (source) => source.url,
    );
    const ready = new Map<string, PreparedCareerSource>();

    for (const source of sources) {
      const checked = prepareCareerSource({ ...source, existingUrls });

      if (!checked.ok) {
        return checked.problem === "url"
          ? { ok: false, problem: "source-url", reason: checked.reason }
          : { ok: false, problem: "source-duplicate" };
      }

      const prepared = withPagePlatform(checked, pagePlatforms);

      if (ready.has(prepared.normalizedUrl)) {
        continue;
      }

      const taken = await findCompanyWithSource(tx, {
        userId,
        normalizedUrl: prepared.normalizedUrl,
        exceptCompanyId: companyId,
      });

      if (taken) {
        return { ok: false, problem: "source-taken", company: taken };
      }

      ready.set(prepared.normalizedUrl, prepared);
    }

    if (ready.size > 0) {
      await tx.insert(careerSources).values(
        [...ready.values()].map((prepared) => ({
          companyId,
          url: prepared.url,
          normalizedUrl: prepared.normalizedUrl,
          label: prepared.label,
          platform: prepared.platform,
          isTracked: prepared.isTracked,
        })),
      );
    }

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
