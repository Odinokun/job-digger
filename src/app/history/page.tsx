import { getTranslations } from "next-intl/server";

import { listCheckRuns } from "@/server/checks/history";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { HistoryBoard } from "./history-board";

export default async function HistoryPage() {
  const t = await getTranslations("HistoryPage");

  const db = getDb();
  const user = await getSystemUser(db);
  const { items, nextCursor } = await listCheckRuns(db, { userId: user.id });

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      {items.length === 0 ? (
        // No button: checks are started only from the Companies page.
        <p className="mt-2 text-sm text-muted">{t("empty")}</p>
      ) : (
        <HistoryBoard
          // A new finished check means a new first row: the table is rebuilt
          // from the first batch instead of the old state.
          key={items[0].id}
          initialItems={items}
          initialCursor={nextCursor}
        />
      )}
    </>
  );
}
