"use server";

import { runAction } from "@/app/action-result";
import { markSummaryShown } from "@/server/checks/check-status";
import { retryFailedSources } from "@/server/checks/failed-sources";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

/**
 * Підсумок перевірки показано - більше він не спливає (docs/checks-and-queue.md,
 * розділ 8). `runId` - недовірений ввід: чужий запуск `markSummaryShown` не
 * позначить.
 */
export async function markCheckSummaryShownAction(
  runId: unknown,
): Promise<{ ok: boolean }> {
  if (typeof runId !== "string") {
    return { ok: false };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    await markSummaryShown(db, { userId: user.id, runId, now: new Date() });
  });

  return { ok: outcome.ok };
}

export type RetryFailedSourcesActionResult =
  | { ok: true; queued: number }
  | { ok: false; reason: "check-running" | "unexpected" };

/**
 * Retry одного джерела або Retry all failed (`"all"`) у Failed Sources Drawer.
 * Аргумент - недовірений ввід: повторюються лише джерела зі списку drawer
 * (`retryFailedSources`).
 */
export async function retryFailedSourcesAction(
  sourceIds: unknown,
): Promise<RetryFailedSourcesActionResult> {
  const valid =
    sourceIds === "all" ||
    (Array.isArray(sourceIds) &&
      sourceIds.every((id) => typeof id === "string"));
  if (!valid) {
    return { ok: false, reason: "unexpected" };
  }

  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return retryFailedSources(db, {
      userId: user.id,
      sourceIds: sourceIds as string[] | "all",
      now: new Date(),
    });
  });

  return outcome.ok ? outcome.value : { ok: false, reason: "unexpected" };
}
