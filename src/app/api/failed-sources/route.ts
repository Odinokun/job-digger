import type { NextRequest } from "next/server";

import { listFailedSources } from "@/server/checks/failed-sources";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { isSameOriginRequest } from "../same-origin";

/**
 * Рядки Failed Sources Drawer. GET-маршрут, а не Server Action, з тієї самої
 * причини, що й `check-status`: drawer перечитує список, поки йде Retry, а
 * Server Actions клієнт надсилає по одній.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request.headers)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getDb();
  const user = await getSystemUser(db);

  return Response.json(await listFailedSources(db, { userId: user.id }), {
    headers: { "Cache-Control": "no-store" },
  });
}
