/**
 * Import CSV: рядки файлу → компанії й джерела (docs/ui.md, розділ 10; задача
 * 6.06). Розбір файлу - `parse.ts`.
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { prepareCareerSource } from "../../lib/companies/career-source.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
} from "../../lib/companies/url.ts";
import { findCompanyUrlConflict } from "../companies/duplicates.ts";
import { findCompanyWithSource } from "../companies/source-duplicates.ts";
import { careerSources, companies } from "../db/schema.ts";
import type { CsvRow } from "./format.ts";

export interface ImportSummary {
  companiesAdded: number;
  sourcesAdded: number;
  /**
   * Пропущене: сторінка, яка вже є в цієї чи іншої компанії, і рядок без
   * сторінки для компанії, що вже є.
   */
  duplicates: number;
  /** Рядки, які не вдалося прочитати: без назви, без адрес чи з кривою адресою. */
  errors: number;
}

/** Рядок, що пройшов перевірку. */
interface ValidRow {
  name: string;
  /** Очищена адреса сайту або `null` - компанія лише з карʼєрною сторінкою. */
  companyUrl: { typed: string; normalized: string } | null;
  careerUrl: string;
  /** Очищена адреса карʼєрної сторінки або `null`, якщо її немає. */
  careerNormalized: string | null;
  label: string;
}

/**
 * Імпортує рядки однією транзакцією.
 *
 * **Та сама компанія** - лише точний збіг очищеної адреси сайту, а компанія без
 * сайту - за своєю карʼєрною сторінкою, як в `addCompany`. Попередження «той
 * самий домен» і «та сама назва» тут не зупиняють: підтвердити їх у файлі
 * нікому, а на одному домені живуть і різні компанії.
 *
 * Помилковий рядок пропускається й рахується, а не зупиняє імпорт. Назва
 * наявної компанії не міняється. Компанія без джерел потрапляє в Not tracked
 * зі статусом Not checked; пошук сторінок після імпорту не запускається.
 */
export async function importCompanies(
  db: NodePgDatabase,
  { userId, rows }: { userId: string; rows: CsvRow[] },
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    companiesAdded: 0,
    sourcesAdded: 0,
    duplicates: 0,
    errors: 0,
  };
  // Рядки однієї компанії - разом: ключ - сайт або, без нього, сторінка.
  const groups = new Map<string, ValidRow[]>();

  for (const row of rows) {
    const valid = validateRow(row);

    if (valid === null) {
      summary.errors += 1;
      continue;
    }

    const key =
      valid.companyUrl === null
        ? `source:${valid.careerNormalized}`
        : `site:${valid.companyUrl.normalized}`;
    groups.set(key, [...(groups.get(key) ?? []), valid]);
  }

  await db.transaction(async (tx) => {
    for (const group of groups.values()) {
      const [first] = group;
      let companyId = await findExisting(tx, userId, first);
      // Перший рядок нової компанії її й додає - навіть без сторінки.
      let addedByThisFile = false;

      if (companyId === null) {
        const [created] = await tx
          .insert(companies)
          .values({
            userId,
            name: first.name,
            url:
              first.companyUrl === null
                ? null
                : absoluteCompanyUrl(first.companyUrl.typed),
            normalizedUrl: first.companyUrl?.normalized ?? null,
          })
          .returning({ id: companies.id });
        companyId = created.id;
        summary.companiesAdded += 1;
        addedByThisFile = true;
      }

      for (const [index, row] of group.entries()) {
        const added = await addSource(tx, userId, companyId, row);

        // Дублікат - кожна сторінка, яку не додали, і рядок без сторінки,
        // якщо компанію додав не він.
        if (added) {
          summary.sourcesAdded += 1;
        } else if (
          row.careerNormalized !== null ||
          !(addedByThisFile && index === 0)
        ) {
          summary.duplicates += 1;
        }
      }
    }
  });

  return summary;
}

/** Рядок із придатними назвою й адресами або `null`. */
function validateRow(row: CsvRow): ValidRow | null {
  const name = row.company_name.trim();
  const typedCompanyUrl = row.company_url.trim();
  const careerUrl = row.career_url.trim();

  if (name === "" || (typedCompanyUrl === "" && careerUrl === "")) {
    return null;
  }

  const company =
    typedCompanyUrl === "" ? null : normalizeCompanyUrl(typedCompanyUrl);
  const career = careerUrl === "" ? null : normalizeCompanyUrl(careerUrl);

  if ((company !== null && !company.ok) || (career !== null && !career.ok)) {
    return null;
  }

  return {
    name,
    companyUrl:
      company === null
        ? null
        : { typed: typedCompanyUrl, normalized: company.url },
    careerUrl,
    careerNormalized: career?.url ?? null,
    label: row.career_label,
  };
}

/** Наявна компанія користувача для групи рядків або `null`. */
async function findExisting(
  db: NodePgDatabase,
  userId: string,
  row: ValidRow,
): Promise<string | null> {
  if (row.companyUrl !== null) {
    const conflict = await findCompanyUrlConflict(db, {
      userId,
      normalizedUrl: row.companyUrl.normalized,
    });

    return conflict.kind === "exact" ? conflict.company.id : null;
  }

  // Без сайту карʼєрна сторінка - уся ідентичність компанії (картка 2.17).
  const owner = await findCompanyWithSource(db, {
    userId,
    normalizedUrl: row.careerNormalized ?? "",
  });

  return owner?.id ?? null;
}

/**
 * Додає сторінку рядка до компанії. `false` - нема чого додавати: сторінки
 * немає, вона вже є в цієї компанії або належить іншій.
 */
async function addSource(
  db: NodePgDatabase,
  userId: string,
  companyId: string,
  row: ValidRow,
): Promise<boolean> {
  if (row.careerNormalized === null) {
    return false;
  }

  const existingUrls = (
    await db
      .select({ url: careerSources.url })
      .from(careerSources)
      .where(eq(careerSources.companyId, companyId))
  ).map((source) => source.url);
  const prepared = prepareCareerSource({
    url: row.careerUrl,
    label: row.label,
    existingUrls,
  });

  if (!prepared.ok) {
    return false;
  }

  const taken = await findCompanyWithSource(db, {
    userId,
    normalizedUrl: prepared.normalizedUrl,
    exceptCompanyId: companyId,
  });

  if (taken) {
    return false;
  }

  await db.insert(careerSources).values({
    companyId,
    url: prepared.url,
    normalizedUrl: prepared.normalizedUrl,
    label: prepared.label,
    platform: prepared.platform,
    isTracked: prepared.isTracked,
  });

  return true;
}
