import type { NextRequest } from "next/server";

import { getCheckStatus } from "@/server/checks/check-status";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { isSameOriginRequest } from "../same-origin";

/**
 * Стан загальної перевірки для опитування з інтерфейсу
 * (docs/checks-and-queue.md, розділ 8). GET-маршрут, а не Server Action:
 * Server Actions клієнт Next надсилає по одній, і опитування раз на 3 с
 * ставало б у чергу з діями користувача
 * (node_modules/next/dist/docs/01-app/02-guides/server-actions.md, «Sequential
 * dispatch on the client»). Без Cache Components route handler не
 * кешується (node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request.headers)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getDb();
  const user = await getSystemUser(db);

  return Response.json(await getCheckStatus(db, { userId: user.id }), {
    // Стан змінюється щосекунди - браузер не повинен його зберігати.
    headers: { "Cache-Control": "no-store" },
  });
}
