import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { normalizedSourceUrl } from "../db/testing/career-source-values.ts";
import { testDb } from "../db/testing/test-db.ts";
import { setSourceReferenceOnly } from "./reference-only.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

async function insertSource(
  userId: string,
  platform: "unsupported" | "greenhouse",
) {
  const [company] = await testDb
    .insert(companies)
    .values({ userId, name: "Kinggroup", ...companySiteValues("Kinggroup") })
    .returning();
  const url =
    platform === "unsupported"
      ? "https://kinggroup.example/vacancies/tech"
      : "https://boards.greenhouse.io/kinggroup";
  const [source] = await testDb
    .insert(careerSources)
    .values({
      companyId: company.id,
      url,
      normalizedUrl: normalizedSourceUrl(url),
      platform,
      isTracked: platform !== "unsupported",
    })
    .returning();

  return source;
}

async function readFlag(sourceId: string) {
  const [row] = await testDb
    .select({ isReferenceOnly: careerSources.isReferenceOnly })
    .from(careerSources)
    .where(eq(careerSources.id, sourceId));

  return row?.isReferenceOnly;
}

describe("setSourceReferenceOnly", () => {
  it("marks an unsupported page as reference only and unmarks it", async () => {
    const user = await seedSystemUser(testDb);
    const source = await insertSource(user.id, "unsupported");

    expect(
      await setSourceReferenceOnly(testDb, {
        userId: user.id,
        sourceId: source.id,
        referenceOnly: true,
      }),
    ).toEqual({ ok: true });
    expect(await readFlag(source.id)).toBe(true);

    await setSourceReferenceOnly(testDb, {
      userId: user.id,
      sourceId: source.id,
      referenceOnly: false,
    });
    expect(await readFlag(source.id)).toBe(false);
  });

  it("refuses a page that is read by a parser", async () => {
    const user = await seedSystemUser(testDb);
    const source = await insertSource(user.id, "greenhouse");

    expect(
      await setSourceReferenceOnly(testDb, {
        userId: user.id,
        sourceId: source.id,
        referenceOnly: true,
      }),
    ).toEqual({ ok: false });
    expect(await readFlag(source.id)).toBe(false);
  });

  it("does not touch a source of another user", async () => {
    const owner = await seedSystemUser(testDb);
    const [stranger] = await testDb
      .insert(users)
      .values({ email: "stranger@job-digger.local" })
      .returning();
    const source = await insertSource(owner.id, "unsupported");

    expect(
      await setSourceReferenceOnly(testDb, {
        userId: stranger.id,
        sourceId: source.id,
        referenceOnly: true,
      }),
    ).toEqual({ ok: false });
    expect(await readFlag(source.id)).toBe(false);
  });

  it("answers no for an id that is not a uuid", async () => {
    // The id arrives as a Server Action argument - it can be any string.
    const user = await seedSystemUser(testDb);

    expect(
      await setSourceReferenceOnly(testDb, {
        userId: user.id,
        sourceId: "not-a-uuid",
        referenceOnly: true,
      }),
    ).toEqual({ ok: false });
  });
});
