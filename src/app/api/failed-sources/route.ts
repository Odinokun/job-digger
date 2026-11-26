import type { NextRequest } from "next/server";

import { listFailedSources } from "@/server/checks/failed-sources";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { isSameOriginRequest } from "../same-origin";

/**
 * The rows of the Failed Sources Drawer. A GET route, not a Server Action, for the
 * same reason as `check-status`: the drawer re-reads the list while a Retry runs,
 * and the client sends Server Actions one at a time.
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
