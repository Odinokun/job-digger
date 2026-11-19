"use server";

import { runAction } from "@/app/action-result";
import { markSummaryShown } from "@/server/checks/check-status";
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
