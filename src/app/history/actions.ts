"use server";

import { runAction } from "@/app/action-result";
import type { CheckRunRow } from "@/lib/checks/check-status";
import type { Cursor } from "@/lib/pagination/cursor";
import { listCheckRuns } from "@/server/checks/history";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

export type LoadMoreHistoryResult =
  { ok: true; items: CheckRunRow[]; nextCursor: Cursor | null } | { ok: false };

/**
 * The next 20 History records. The cursor is untrusted input: `listCheckRuns`
 * cleans it through `parseCursor`, and the user is taken on the server.
 */
export async function loadMoreHistoryAction(
  after: unknown,
): Promise<LoadMoreHistoryResult> {
  const outcome = await runAction(async () => {
    const db = getDb();
    const user = await getSystemUser(db);

    return listCheckRuns(db, {
      userId: user.id,
      after: after as Cursor | null,
    });
  });

  return outcome.ok ? { ok: true, ...outcome.value } : { ok: false };
}
