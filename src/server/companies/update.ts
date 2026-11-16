import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, companies } from "../db/schema.ts";

/** Що користувач змінив у модалці Edit. */
export type UpdateCompanyInput = {
  userId: string;
  companyId: string;
  /** Нова назва компанії. Адреси в цій модалці не редагуються. */
  name: string;
  /** Джерела, позначені до видалення. Зміна застосовується на Save. */
  removeSourceIds?: string[];
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
  | { ok: false; problem: "not-found" };

/**
 * Перейменовує компанію й видаляє позначені карʼєрні джерела.
 *
 * Усе в одній транзакції: інакше крива назва могла б лишити джерела вже
 * видаленими. Вакансії видаленого джерела теж мають зникати (docs/decisions.md,
 * рішення 6) - це додасться разом із таблицею `vacancies` у задачі 3.04, бо
 * видаляти поки нічого.
 */
export async function updateCompany(
  db: NodePgDatabase,
  { userId, companyId, name, removeSourceIds = [] }: UpdateCompanyInput,
): Promise<UpdateCompanyResult> {
  const trimmedName = name.trim();

  if (trimmedName === "") {
    return { ok: false, problem: "name-required" };
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
