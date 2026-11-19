/**
 * Find new pages: повторний пошук карʼєрних сторінок для всіх компаній вкладки
 * Not tracked (docs/ui.md, розділ 4.3; задача 5.10). Тут лише постановка в
 * чергу - кожну компанію шукає цикл черги (`queue/discover-task.ts`).
 */
import { and, eq, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, checkTasks, companies } from "../db/schema.ts";

/**
 * Ключ advisory lock, яким серіалізуються запуски Find new pages одного
 * користувача. Перше число - сама дія, друге - користувач.
 */
const FIND_NEW_PAGES_LOCK_KEY = 5_100_001;

export interface StartFindNewPagesInput {
  userId: string;
  /** Час постановки в чергу. */
  now: Date;
}

export type StartFindNewPagesResult =
  | { ok: true; total: number }
  | { ok: false; reason: "already-running" | "nothing-to-search" };

/**
 * Ставить у чергу пошук для кожної компанії Not tracked - фоновий, як Check
 * all, і без запуску: у History Find new pages не пишеться (рішення автора
 * 19.11.2026).
 *
 * Без рядка запуску одну активну дію на користувача не втримає унікальний
 * індекс, як у Check all, тож перевірка «чи триває» і вставка йдуть під
 * advisory lock користувача: другий одночасний клік дочекається першого і
 * побачить його завдання.
 */
export async function startFindNewPages(
  db: NodePgDatabase,
  { userId, now }: StartFindNewPagesInput,
): Promise<StartFindNewPagesResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${FIND_NEW_PAGES_LOCK_KEY}, hashtext(${userId}))`,
    );

    if (await isFindingNewPages(tx, userId)) {
      return { ok: false, reason: "already-running" };
    }

    // Вкладка Not tracked - компанії без жодного джерела, що відстежується.
    const notTracked = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(
        and(
          eq(companies.userId, userId),
          notExists(
            tx
              .select({ id: careerSources.id })
              .from(careerSources)
              .where(
                and(
                  sql`${careerSources.companyId} = ${companies.id}`,
                  eq(careerSources.isTracked, true),
                ),
              ),
          ),
        ),
      );

    if (notTracked.length === 0) {
      return { ok: false, reason: "nothing-to-search" };
    }

    await tx.insert(checkTasks).values(
      notTracked.map((company) => ({
        kind: "discover" as const,
        companyId: company.id,
        priority: "background" as const,
        createdAt: now,
      })),
    );

    return { ok: true, total: notTracked.length };
  });
}

/**
 * Чи триває Find new pages користувача: є незавершені завдання пошуку або
 * перші перевірки дошок, які пошук додав. Другі - фонові завдання `check` без
 * запуску: Retry ручний, а Check all має запуск. Поки вони йдуть, інтерфейс
 * опитує стан і по завершенню перечитує список і лічильник Jobs.
 */
export async function isFindingNewPages(
  db: NodePgDatabase,
  userId: string,
): Promise<boolean> {
  const unfinished = inArray(checkTasks.status, ["queued", "running"]);
  const [searches, firstChecks] = await Promise.all([
    db
      .select({ id: checkTasks.id })
      .from(checkTasks)
      .innerJoin(companies, eq(companies.id, checkTasks.companyId))
      .where(
        and(
          eq(companies.userId, userId),
          eq(checkTasks.kind, "discover"),
          unfinished,
        ),
      )
      .limit(1),
    db
      .select({ id: checkTasks.id })
      .from(checkTasks)
      .innerJoin(careerSources, eq(careerSources.id, checkTasks.sourceId))
      .innerJoin(companies, eq(companies.id, careerSources.companyId))
      .where(
        and(
          eq(companies.userId, userId),
          eq(checkTasks.kind, "check"),
          eq(checkTasks.priority, "background"),
          isNull(checkTasks.runId),
          unfinished,
        ),
      )
      .limit(1),
  ]);

  return searches.length > 0 || firstChecks.length > 0;
}
