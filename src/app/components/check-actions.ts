"use server";

import { runAction } from "@/app/action-result";
import { markSummaryShown } from "@/server/checks/check-status";
import { retryFailedSources } from "@/server/checks/failed-sources";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

/**
 * The check summary has been shown - it no longer pops up
 * (src/server/checks/README.md). `runId` is untrusted input: `markSummaryShown`
 * will not mark someone else's run.
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
 * Retry one source or Retry all failed (`"all"`) in the Failed Sources Drawer.
 * The argument is untrusted input: only sources from the drawer's list are
 * retried (`retryFailedSources`).
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
