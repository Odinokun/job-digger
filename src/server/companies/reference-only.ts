import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { isUuid } from "../../lib/uuid.ts";
import { careerSources, companies } from "../db/schema.ts";

/**
 * Позначка «лише посилання» на сторінці, яку нічим прочитати (задача 6.17).
 *
 * Сторінка лишається в картці посиланням, але не рахується непрочитаною: не
 * тримає компанію в Needs attention і не входить у бейдж «N pages not read».
 * Позначається лише `unsupported` - джерело, яке читається чи падає, так не
 * сховати. Автоматично позначка не ставиться: застосунок не знає, чи на сайті
 * немає вакансій, яких нема в ATS.
 *
 * `{ ok: false }` - джерела немає, воно чуже, читається парсером або id не у
 * формі UUID. Причини не
 * розрізняються: кнопка є лише в рядку Unsupported, тож відмова означає, що
 * список застарів, і відповідь на неї одна - перечитати його.
 */
export async function setSourceReferenceOnly(
  db: NodePgDatabase,
  {
    userId,
    sourceId,
    referenceOnly,
  }: { userId: string; sourceId: string; referenceOnly: boolean },
): Promise<{ ok: boolean }> {
  if (!isUuid(sourceId)) {
    return { ok: false };
  }

  // Власника перевіряє підзапит: id джерела приходить із клієнта.
  const ownCompanies = db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.userId, userId));

  const updated = await db
    .update(careerSources)
    .set({ isReferenceOnly: referenceOnly })
    .where(
      and(
        eq(careerSources.id, sourceId),
        eq(careerSources.platform, "unsupported"),
        inArray(careerSources.companyId, ownCompanies),
      ),
    )
    .returning({ id: careerSources.id });

  return { ok: updated.length > 0 };
}
