import { revalidatePath } from "next/cache";
import { cache } from "react";

import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import { countUnread } from "@/server/vacancies/marks";

/**
 * Кількість непрочитаних вакансій - для меню біля Jobs і назви вкладки браузера
 * (docs/ui.md, розділ 4.1). Те саме число, що рядків у вкладці Unread:
 * `countUnread` бере ту саму умову вкладки, тож Closed сюди не входять.
 *
 * `cache` з React - один запит на рендер, хоч число потрібне і шапці, і
 * `generateMetadata` у layout (https://react.dev/reference/react/cache).
 */
export const getUnreadCount = cache(async (): Promise<number> => {
  const db = getDb();
  const user = await getSystemUser(db);

  return (await countUnread(db, { userId: user.id })).count;
});

/**
 * Позначає застарілим усе, що показує лічильник, - кореневий layout і всі
 * сторінки під ним. Викликається кожною дією, що змінює кількість
 * непрочитаних: шапка живе в layout, а його Next між переходами не
 * перерендерює. `revalidatePath(path, "layout")` скидає layout сегмента і все
 * під ним (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md).
 */
export function revalidateUnreadCount(): void {
  revalidatePath("/", "layout");
}
