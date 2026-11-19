/**
 * Check all: загальна перевірка всіх компаній з вкладки Tracked
 * (docs/checks-and-queue.md, розділ 8). Тут лише постановка в чергу - самі
 * джерела перевіряє цикл черги (`queue/worker.ts`).
 */
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  careerSources,
  checkRuns,
  checkTasks,
  companies,
} from "../db/schema.ts";

export interface StartCheckAllInput {
  userId: string;
  /** Час запуску - Date & time у History. */
  now: Date;
}

export type StartCheckAllResult =
  | { ok: true; runId: string; total: number }
  | { ok: false; reason: "already-running" | "nothing-to-check" };

export async function startCheckAll(
  db: NodePgDatabase,
  { userId, now }: StartCheckAllInput,
): Promise<StartCheckAllResult> {
  return db.transaction(async (tx) => {
    // Вкладка Tracked - компанії з хоча б одним джерелом, що відстежується,
    // тож досить узяти самі такі джерела.
    const sources = await tx
      .select({ id: careerSources.id })
      .from(careerSources)
      .innerJoin(companies, eq(companies.id, careerSources.companyId))
      .where(
        and(eq(companies.userId, userId), eq(careerSources.isTracked, true)),
      );

    if (sources.length === 0) {
      return { ok: false, reason: "nothing-to-check" };
    }

    // Одну активну перевірку на користувача тримає частковий унікальний
    // індекс. `do nothing` замість винятку: другий одночасний клік дочекається
    // першої транзакції і просто нічого не вставить.
    const [run] = await tx
      .insert(checkRuns)
      .values({ userId, startedAt: now, sourcesTotal: sources.length })
      .onConflictDoNothing()
      .returning({ id: checkRuns.id });

    if (run === undefined) {
      return { ok: false, reason: "already-running" };
    }

    await tx.insert(checkTasks).values(
      sources.map((source) => ({
        sourceId: source.id,
        runId: run.id,
        priority: "background" as const,
        createdAt: now,
      })),
    );

    return { ok: true, runId: run.id, total: sources.length };
  });
}
