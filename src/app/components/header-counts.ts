import { revalidatePath } from "next/cache";
import { cache } from "react";

import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { countCompaniesByTab } from "@/server/companies/list";
import { countUnread } from "@/server/vacancies/marks";

/**
 * The number of unread vacancies - for the menu next to Jobs and the browser tab
 * title. The same number as the rows in the Unread tab: `countUnread` uses the
 * same tab condition, so Closed vacancies are not counted.
 *
 * React `cache` gives one query per render, although both the header and
 * `generateMetadata` in the layout need the number
 * (https://react.dev/reference/react/cache).
 */
export const getUnreadCount = cache(async (): Promise<number> => {
  const db = getDb();
  const user = await getSystemUser(db);

  return (await countUnread(db, { userId: user.id })).count;
});

/**
 * The number of companies needing attention - for the menu next to Companies
 * (task 6.11). The same number as in the Needs attention tab.
 */
export const getAttentionCount = cache(async (): Promise<number> => {
  const db = getDb();
  const user = await getSystemUser(db);

  return (await countCompaniesByTab(db, user.id)).attention;
});

/**
 * Marks everything the header counters show as stale - the root layout and all
 * pages under it. Every action that changes the number of unread vacancies or of
 * companies needing attention calls it: the header lives in the layout, which
 * Next does not re-render between navigations. `revalidatePath(path, "layout")`
 * resets the segment's layout and everything under it
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md).
 */
export function revalidateHeaderCounts(): void {
  revalidatePath("/", "layout");
}
