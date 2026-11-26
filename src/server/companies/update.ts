import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  prepareCareerSource,
  type PreparedCareerSource,
} from "../../lib/companies/career-source.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";
import {
  findCompanyUrlConflict,
  type ConflictingCompany,
} from "./duplicates.ts";
import { withPagePlatform, type PagePlatforms } from "./page-platform.ts";
import {
  findCompanyWithSource,
  type CompanyWithSource,
} from "./source-duplicates.ts";

/** Що користувач змінив у модалці Edit. */
export type UpdateCompanyInput = {
  userId: string;
  companyId: string;
  /** Нова назва компанії. */
  name: string;
  /**
   * Головний сайт з поля модалки. Обовʼязковий, як і в Add company (задача
   * company-site-required). `undefined` - сайт не змінюється.
   */
  url?: string;
  /** Джерела, позначені до видалення. Зміна застосовується на Save. */
  removeSourceIds?: string[];
  /**
   * Підписи наявних джерел: id джерела - підпис із поля. Порожній підпис
   * означає «прибрати підпис», а не «не чіпати»: форма надсилає всі поля.
   */
  sourceLabels?: Record<string, string>;
  /**
   * Нова карʼєрна сторінка, уведена руками. Доки автоматичного пошуку немає
   * (задача 5.07), це єдиний спосіб дати компанії друге джерело - наприклад,
   * три фільтри однієї сторінки mozilla.org (картка 2.16).
   */
  addSource?: { url: string; label?: string };
  /** Платформи, упізнані за вмістом сторінки (`platformsByPage`, задача 5.13). */
  pagePlatforms?: PagePlatforms;
};

/**
 * Чим закінчилося редагування.
 *
 * `not-found` покриває і неіснуючу компанію, і чужу: відповідь однакова, бо
 * інакше вона підказувала б, що такий рядок у базі є.
 */
export type UpdateCompanyResult =
  | { ok: true }
  | { ok: false; problem: "name-required" }
  | { ok: false; problem: "not-found" }
  /** Сайт порожній або непридатний - як у `addCompany`. */
  | { ok: false; problem: "company-url"; reason: UrlRefusalReason }
  /** Такий сайт уже має інша компанія користувача. */
  | { ok: false; problem: "already-added"; company: ConflictingCompany }
  | { ok: false; problem: "source-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "source-duplicate" }
  /**
   * Це джерело вже належить іншій компанії того самого користувача. Окремо від
   * `source-duplicate`: там сторінка вже є в цієї ж компанії й видно її в
   * списку вище, а тут треба назвати, у кого вона (картка 2.17).
   */
  | { ok: false; problem: "source-taken"; company: CompanyWithSource };

/**
 * Перейменовує компанію, перепідписує й видаляє її карʼєрні джерела й додає нове.
 *
 * Усе в одній транзакції: інакше крива назва могла б лишити джерела вже
 * видаленими. Вакансії видаленого джерела, зокрема обрані, зникають разом із ним:
 * `vacancies.source_id` - `on delete cascade` (`server/db/schema.ts`).
 *
 * Адреса нового джерела перевіряється **до** транзакції, як і в `addCompany`:
 * відмова тоді не виконує половини роботи - ні перейменування, ні видалень.
 */
export async function updateCompany(
  db: NodePgDatabase,
  {
    userId,
    companyId,
    name,
    url,
    removeSourceIds = [],
    sourceLabels = {},
    addSource,
    pagePlatforms,
  }: UpdateCompanyInput,
): Promise<UpdateCompanyResult> {
  const trimmedName = name.trim();

  if (trimmedName === "") {
    return { ok: false, problem: "name-required" };
  }

  // Сайт перевіряється до транзакції, як і нове джерело: відмова не виконує
  // половини роботи. Точний збіг із сайтом іншої компанії - відмова; свій
  // незмінений сайт - не конфлікт. «Той самий домен» тут не попереджає: це
  // правка наявної компанії, а не нова картка.
  let site: { url: string; normalizedUrl: string } | null = null;

  if (url !== undefined) {
    const normalized = normalizeCompanyUrl(url);

    if (!normalized.ok) {
      return { ok: false, problem: "company-url", reason: normalized.reason };
    }

    const conflict = await findCompanyUrlConflict(db, {
      userId,
      normalizedUrl: normalized.url,
    });

    if (conflict.kind === "exact" && conflict.company.id !== companyId) {
      return { ok: false, problem: "already-added", company: conflict.company };
    }

    site = {
      url: absoluteCompanyUrl(url.trim()),
      normalizedUrl: normalized.url,
    };
  }

  let newSource: PreparedCareerSource | null = null;

  if (addSource) {
    const prepared = prepareCareerSource({
      url: addSource.url,
      label: addSource.label,
      existingUrls: await keptSourceUrls(db, {
        userId,
        companyId,
        removeSourceIds,
      }),
    });

    if (!prepared.ok) {
      return prepared.problem === "url"
        ? { ok: false, problem: "source-url", reason: prepared.reason }
        : { ok: false, problem: "source-duplicate" };
    }

    newSource = withPagePlatform(prepared, pagePlatforms);
  }

  return db.transaction(async (tx) => {
    // Назва оновлюється з умовою на користувача, і саме вона ж перевіряє
    // доступ: чужий рядок не оновиться й нічого не поверне.
    const [updated] = await tx
      .update(companies)
      .set(
        site === null ? { name: trimmedName } : { name: trimmedName, ...site },
      )
      .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
      .returning({ id: companies.id });

    if (!updated) {
      return { ok: false, problem: "not-found" };
    }

    if (removeSourceIds.length > 0) {
      // Умова на `companyId` обовʼязкова: id джерел приходять із клієнта, тому
      // без неї можна було б видалити джерело іншої компанії.
      await tx
        .delete(careerSources)
        .where(
          and(
            eq(careerSources.companyId, companyId),
            inArray(careerSources.id, removeSourceIds),
          ),
        );
    }

    // Підписи наявних джерел. Запитів тут стільки, скільки полів у модалці:
    // джерел у компанії одиниці, тому один `UPDATE ... CASE` того не варт.
    // `company_id` в умові обовʼязковий - id приходять із клієнта.
    for (const [sourceId, label] of Object.entries(sourceLabels)) {
      const trimmed = label.trim();

      await tx
        .update(careerSources)
        .set({ label: trimmed === "" ? null : trimmed })
        .where(
          and(
            eq(careerSources.companyId, companyId),
            eq(careerSources.id, sourceId),
          ),
        );
    }

    if (newSource) {
      const taken = await findCompanyWithSource(tx, {
        userId,
        normalizedUrl: newSource.normalizedUrl,
        exceptCompanyId: companyId,
      });

      if (taken) {
        return { ok: false, problem: "source-taken", company: taken };
      }

      await tx.insert(careerSources).values({
        companyId,
        url: newSource.url,
        normalizedUrl: newSource.normalizedUrl,
        label: newSource.label,
        platform: newSource.platform,
        isTracked: newSource.isTracked,
      });
    }

    const left = await tx
      .select({ id: careerSources.id })
      .from(careerSources)
      .where(eq(careerSources.companyId, companyId))
      .limit(1);

    // Без джерел компанія опиняється в Not tracked, і попередній статус пошуку
    // її більше не описує: «не перевіряли» правдивіше за «не знайдено»
    // (картка 2.05).
    if (left.length === 0) {
      await tx
        .update(companies)
        .set({ discoveryStatus: "not_checked" })
        .where(eq(companies.id, companyId));
    }

    return { ok: true };
  });
}

/**
 * Адреси джерел, які компанія має зберегти після цього Save.
 *
 * Позначені до видалення не враховуються: інакше заміна адреси на ту саму
 * впиралася б у джерело, якого після Save вже не буде.
 *
 * Запит іде через `companies` з умовою на користувача: без неї відповідь
 * «уже є таке джерело» розказувала б про чужу компанію.
 */
async function keptSourceUrls(
  db: NodePgDatabase,
  {
    userId,
    companyId,
    removeSourceIds,
  }: { userId: string; companyId: string; removeSourceIds: string[] },
): Promise<string[]> {
  const rows = await db
    .select({ id: careerSources.id, url: careerSources.url })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));

  return rows
    .filter((row) => !removeSourceIds.includes(row.id))
    .map((row) => row.url);
}
