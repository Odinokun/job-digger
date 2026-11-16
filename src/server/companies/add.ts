import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, companies } from "../db/schema.ts";
import {
  findCompanyUrlConflict,
  type ConflictingCompany,
} from "./duplicates.ts";
import { detectPlatform } from "../../lib/companies/platform.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "../../lib/companies/url.ts";

/** Що користувач увів у модалці Add company. */
export type AddCompanyInput = {
  userId: string;
  name: string;
  /** Головний сайт компанії. Зберігається зі шляхом. */
  url: string;
  /** Карʼєрна сторінка. Необовʼязкова: без неї компанія йде в Not tracked. */
  careerUrl?: string;
  /**
   * Користувач уже бачив попередження про інші компанії того самого домену
   * і натиснув Save вдруге.
   */
  sameDomainConfirmed?: boolean;
};

/**
 * Чим закінчилося додавання.
 *
 * Результат-обʼєкт, а не винятки: кожна відмова тут - очікуваний ввід
 * користувача, який модалка мусить показати (той самий підхід, що в
 * `normalizeCompanyUrl`). `same-domain` - не помилка, а попередження:
 * повторний Save із `sameDomainConfirmed` його проходить.
 */
export type AddCompanyResult =
  | { ok: true; companyId: string }
  | { ok: false; problem: "name-required" }
  | { ok: false; problem: "company-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "career-url"; reason: UrlRefusalReason }
  | { ok: false; problem: "already-added"; company: ConflictingCompany }
  | { ok: false; problem: "same-domain"; companies: ConflictingCompany[] };

/**
 * Додає компанію з однією карʼєрною сторінкою, введеною руками.
 *
 * Автоматичного пошуку сторінок тут немає - він приходить в етапі 5
 * (docs/discovery-and-parsing.md, розділ 5), тому платформа джерела виводиться
 * з адреси через `detectPlatform`, а `discovery_status` лишається `not_checked`:
 * пошуку ще не було, і це не те саме, що «не знайдено».
 *
 * Уся перевірка вводу відбувається до першої вставки, а компанія з її джерелом
 * пишуться в одній транзакції: інакше крива карʼєрна адреса лишила б у базі
 * компанію без джерела.
 */
export async function addCompany(
  db: NodePgDatabase,
  {
    userId,
    name,
    url,
    careerUrl,
    sameDomainConfirmed = false,
  }: AddCompanyInput,
): Promise<AddCompanyResult> {
  const trimmedName = name.trim();

  if (trimmedName === "") {
    return { ok: false, problem: "name-required" };
  }

  const normalizedCompanyUrl = normalizeCompanyUrl(url);

  if (!normalizedCompanyUrl.ok) {
    return {
      ok: false,
      problem: "company-url",
      reason: normalizedCompanyUrl.reason,
    };
  }

  // Порожнє поле карʼєрної сторінки - це «джерела немає», а не крива адреса.
  const typedCareerUrl = careerUrl?.trim() ?? "";
  const normalizedCareerUrl =
    typedCareerUrl === "" ? null : normalizeCompanyUrl(typedCareerUrl);

  if (normalizedCareerUrl && !normalizedCareerUrl.ok) {
    return {
      ok: false,
      problem: "career-url",
      reason: normalizedCareerUrl.reason,
    };
  }

  const conflict = await findCompanyUrlConflict(db, {
    userId,
    normalizedUrl: normalizedCompanyUrl.url,
  });

  if (conflict.kind === "exact") {
    return { ok: false, problem: "already-added", company: conflict.company };
  }

  // Той самий домен - лише попередження: на ньому можуть жити різні компанії,
  // наприклад національні версії. Рішення лишається за користувачем.
  if (conflict.kind === "same-domain" && !sameDomainConfirmed) {
    return {
      ok: false,
      problem: "same-domain",
      companies: conflict.companies,
    };
  }

  return db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        userId,
        name: trimmedName,
        url: absoluteCompanyUrl(url),
        normalizedUrl: normalizedCompanyUrl.url,
      })
      // Перевірка вище дружня, але не атомарна: між нею і цією вставкою інший
      // запит міг додати ту саму компанію. Останнє слово за unique-індексом
      // `(user_id, normalized_url)`, тому замість помилки - `do nothing`.
      .onConflictDoNothing({
        target: [companies.userId, companies.normalizedUrl],
      })
      .returning();

    if (!company) {
      const [existing] = await tx
        .select({ id: companies.id, name: companies.name, url: companies.url })
        .from(companies)
        .where(
          and(
            eq(companies.userId, userId),
            eq(companies.normalizedUrl, normalizedCompanyUrl.url),
          ),
        );

      if (!existing) {
        throw new Error(
          `Company url ${normalizedCompanyUrl.url} conflicted on insert but cannot be found`,
        );
      }

      return { ok: false, problem: "already-added", company: existing };
    }

    if (normalizedCareerUrl?.ok) {
      const platform = detectPlatform(normalizedCareerUrl.url);

      await tx.insert(careerSources).values({
        companyId: company.id,
        url: absoluteCompanyUrl(typedCareerUrl),
        platform,
        // Сторінку, яку нічим прочитати, зберігаємо без відстеження
        // (docs/ui.md, розділ 4.3).
        isTracked: platform !== "unsupported",
      });
    }

    return { ok: true, companyId: company.id };
  });
}
