import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  prepareCareerSource,
  type PreparedCareerSource,
} from "../../lib/companies/career-source.ts";
import type { UrlRefusalReason } from "../../lib/companies/url.ts";
import { careerSources, companies } from "../db/schema.ts";

/** Що користувач змінив у модалці Edit. */
export type UpdateCompanyInput = {
  userId: string;
  companyId: string;
  /** Нова назва компанії. Головний сайт у цій модалці не редагується. */
  name: string;
  /** Джерела, позначені до видалення. Зміна застосовується на Save. */
  removeSourceIds?: string[];
  /**
   * Нова карʼєрна сторінка, уведена руками. Доки автоматичного пошуку немає
   * (задача 5.07), це єдиний спосіб дати компанії друге джерело - наприклад,
   * три фільтри однієї сторінки mozilla.org (картка 2.16).
   */
  addSource?: { url: string; label?: string };
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
  | { ok: false; problem: "source-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "source-duplicate" };

/**
 * Перейменовує компанію, видаляє позначені карʼєрні джерела й додає нове.
 *
 * Усе в одній транзакції: інакше крива назва могла б лишити джерела вже
 * видаленими. Вакансії видаленого джерела теж мають зникати (docs/decisions.md,
 * рішення 6) - це додасться разом із таблицею `vacancies` у задачі 3.04, бо
 * видаляти поки нічого.
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
    removeSourceIds = [],
    addSource,
  }: UpdateCompanyInput,
): Promise<UpdateCompanyResult> {
  const trimmedName = name.trim();

  if (trimmedName === "") {
    return { ok: false, problem: "name-required" };
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

    newSource = prepared;
  }

  return db.transaction(async (tx) => {
    // Назва оновлюється з умовою на користувача, і саме вона ж перевіряє
    // доступ: чужий рядок не оновиться й нічого не поверне.
    const [updated] = await tx
      .update(companies)
      .set({ name: trimmedName })
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

    if (newSource) {
      await tx.insert(careerSources).values({
        companyId,
        url: newSource.url,
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
    // (картка 2.05, docs/ui.md розділ 4.3).
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
