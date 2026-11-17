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
  /**
   * Головний сайт компанії. Зберігається зі шляхом.
   *
   * Необовʼязковий: адреса ATS головного сайту не дає, і вигадувати його за
   * користувача нема з чого (картка 2.17). Але хоча б одна адреса - сайт або
   * карʼєрна сторінка - потрібна, інакше компанію не ідентифікує ніщо.
   */
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
  /**
   * Порожні обидва поля адреси. Окремо від `company-url`: там адреса є, але
   * непридатна, і виправляти треба саме її, а тут вибір за користувачем -
   * увести будь-яку з двох.
   */
  | { ok: false; problem: "address-required" }
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

  // Порожнє поле - це «адреси немає», а не крива адреса. Так само для обох
  // полів: порожній сайт не те саме, що `ftp://`.
  const typedUrl = url.trim();
  const typedCareerUrl = careerUrl?.trim() ?? "";

  if (typedUrl === "" && typedCareerUrl === "") {
    return { ok: false, problem: "address-required" };
  }

  const normalizedCompanyUrl =
    typedUrl === "" ? null : normalizeCompanyUrl(typedUrl);

  if (normalizedCompanyUrl && !normalizedCompanyUrl.ok) {
    return {
      ok: false,
      problem: "company-url",
      reason: normalizedCompanyUrl.reason,
    };
  }

  const normalizedCareerUrl =
    typedCareerUrl === "" ? null : normalizeCompanyUrl(typedCareerUrl);

  if (normalizedCareerUrl && !normalizedCareerUrl.ok) {
    return {
      ok: false,
      problem: "career-url",
      reason: normalizedCareerUrl.reason,
    };
  }

  // Без сайту порівнювати нічого: компанії без нього не конфліктують між собою
  // по сайту, а однакову компанію ловить дедуплікація карʼєрних джерел.
  const conflict = normalizedCompanyUrl?.ok
    ? await findCompanyUrlConflict(db, {
        userId,
        normalizedUrl: normalizedCompanyUrl.url,
      })
    : { kind: "none" as const };

  // Очищена адреса сайту або `null`: далі вона потрібна і для вставки, і для
  // гілки конфлікту, тож розбирати обʼєднаний тип удруге нема за чим.
  const companyNormalizedUrl = normalizedCompanyUrl?.ok
    ? normalizedCompanyUrl.url
    : null;

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
        url: typedUrl === "" ? null : absoluteCompanyUrl(typedUrl),
        normalizedUrl: companyNormalizedUrl,
      })
      // Перевірка вище дружня, але не атомарна: між нею і цією вставкою інший
      // запит міг додати ту саму компанію. Останнє слово за unique-індексом
      // `(user_id, normalized_url)`, тому замість помилки - `do nothing`.
      .onConflictDoNothing({
        target: [companies.userId, companies.normalizedUrl],
      })
      .returning();

    if (!company) {
      // Конфлікт можливий лише по `(user_id, normalized_url)`, а NULL у
      // PostgreSQL не дорівнює NULL - отже компанія без сайту сюди не
      // потрапляє й вставляється завжди.
      if (companyNormalizedUrl === null) {
        throw new Error(
          "Company without a site conflicted on insert, which the unique index cannot do",
        );
      }

      const [existing] = await tx
        .select({ id: companies.id, name: companies.name, url: companies.url })
        .from(companies)
        .where(
          and(
            eq(companies.userId, userId),
            eq(companies.normalizedUrl, companyNormalizedUrl),
          ),
        );

      if (!existing) {
        throw new Error(
          `Company url ${companyNormalizedUrl} conflicted on insert but cannot be found`,
        );
      }

      // `url` і `normalized_url` пишуться разом, а знайшли ми рядок саме за
      // другим - отже перший теж на місці. Компілятор цього не знає, бо в схемі
      // обидві колонки необовʼязкові (картка 2.17), тож інваріант перевіряємо
      // явно, як і неможливу відсутність рядка вище.
      if (existing.url === null) {
        throw new Error(
          `Company ${existing.id} has a normalized url but no url`,
        );
      }

      return {
        ok: false,
        problem: "already-added",
        company: { id: existing.id, name: existing.name, url: existing.url },
      };
    }

    if (normalizedCareerUrl?.ok) {
      const platform = detectPlatform(normalizedCareerUrl.url);

      await tx.insert(careerSources).values({
        companyId: company.id,
        url: absoluteCompanyUrl(typedCareerUrl),
        normalizedUrl: normalizedCareerUrl.url,
        platform,
        // Сторінку, яку нічим прочитати, зберігаємо без відстеження
        // (docs/ui.md, розділ 4.3).
        isTracked: platform !== "unsupported",
      });
    }

    return { ok: true, companyId: company.id };
  });
}
