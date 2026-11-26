import type { NextRequest } from "next/server";

import { parseExportOptions } from "@/lib/csv/export-options";
import { exportCompanyRows } from "@/server/csv/export";
import { toCsv } from "@/server/csv/format";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { isSameOriginRequest } from "../same-origin";

/**
 * Export CSV (task 6.05). A GET route, not a Server Action: the browser
 * downloads the file itself thanks to `Content-Disposition: attachment`, without
 * pulling the whole CSV into page state.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request.headers)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getDb();
  const user = await getSystemUser(db);
  const rows = await exportCompanyRows(db, {
    userId: user.id,
    ...parseExportOptions(request.nextUrl.searchParams),
  });
  // The date in the name keeps several exports from overwriting each other.
  const date = new Date().toISOString().slice(0, 10);

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-digger-companies-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
