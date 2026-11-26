import type { NextRequest } from "next/server";

import { getCheckStatus } from "@/server/checks/check-status";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { isSameOriginRequest } from "../same-origin";

/**
 * The general check state for polling from the UI
 * (src/server/checks/README.md). A GET route, not a Server Action: the Next
 * client sends Server Actions one at a time, and polling every 3 s would queue
 * up behind the user's actions
 * (node_modules/next/dist/docs/01-app/02-guides/server-actions.md, "Sequential
 * dispatch on the client"). Without Cache Components a route handler is not
 * cached (node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request.headers)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getDb();
  const user = await getSystemUser(db);

  return Response.json(await getCheckStatus(db, { userId: user.id }), {
    // The state changes every second - the browser must not store it.
    headers: { "Cache-Control": "no-store" },
  });
}
