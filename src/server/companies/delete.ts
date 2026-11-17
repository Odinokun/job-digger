import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { companies } from "../db/schema.ts";

/** Яку компанію видаляємо і хто її власник. */
export type DeleteCompanyInput = {
  userId: string;
  companyId: string;
};

/**
 * Чим закінчилося видалення.
 *
 * `not-found` покриває і неіснуючу компанію, і чужу - так само, як у
 * `updateCompany`: інакше відповідь підказувала б, що такий рядок у базі є.
 */
export type DeleteCompanyResult =
  { ok: true } | { ok: false; problem: "not-found" };

/**
 * Видаляє компанію разом з усіма її карʼєрними джерелами.
 *
 * Один запит без транзакції: джерела прибирає `ON DELETE CASCADE` на
 * `career_sources.company_id` (`db/schema.ts`), а вакансії видаленого джерела
 * підуть тим самим каскадом, коли зʼявиться таблиця `vacancies` (задача 3.04).
 * Історична агрегована статистика перевірок при цьому лишається
 * (docs/ui.md, розділ 4.2).
 *
 * Умова на `user_id` і є перевіркою доступу: чужий рядок не видалиться й
 * нічого не повернеться.
 */
export async function deleteCompany(
  db: NodePgDatabase,
  { userId, companyId }: DeleteCompanyInput,
): Promise<DeleteCompanyResult> {
  const [deleted] = await db
    .delete(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)))
    .returning({ id: companies.id });

  return deleted ? { ok: true } : { ok: false, problem: "not-found" };
}
