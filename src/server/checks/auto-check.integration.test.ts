import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { careerSources, checkRuns, companies, users } from "../db/schema.ts";
import { seedSystemUser } from "../db/system-user.ts";
import { testDb } from "../db/testing/test-db.ts";
import { setAutoCheckInterval } from "../settings/settings.ts";
import { runAutoChecks } from "./auto-check.ts";
import { companySiteValues } from "../db/testing/company-values.ts";

const now = new Date("2026-11-20T12:00:00Z");

function hoursBefore(hours: number): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

/** A user with one tracked company - Check all has something to check. */
async function userWithTrackedCompany(email?: string) {
  const user =
    email === undefined
      ? await seedSystemUser(testDb)
      : (await testDb.insert(users).values({ email }).returning())[0];
  const [company] = await testDb
    .insert(companies)
    .values({ userId: user.id, name: "Acme", ...companySiteValues("Acme") })
    .returning();
  await testDb.insert(careerSources).values({
    companyId: company.id,
    url: "https://job-boards.greenhouse.io/acme",
    normalizedUrl: "job-boards.greenhouse.io/acme",
    platform: "greenhouse",
  });

  return user;
}

/** A finished general check that started `hours` ago. */
async function checkedHoursAgo(userId: string, hours: number) {
  await testDb.insert(checkRuns).values({
    userId,
    startedAt: hoursBefore(hours),
    finishedAt: hoursBefore(hours),
  });
}

async function runsOf(userId: string) {
  return testDb.select().from(checkRuns).where(eq(checkRuns.userId, userId));
}

describe("runAutoChecks", () => {
  it("starts a general check once the interval has passed", async () => {
    const user = await userWithTrackedCompany();
    await checkedHoursAgo(user.id, 6);

    await runAutoChecks(testDb, { now, isStartup: false });

    const runs = await runsOf(user.id);
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.startedAt)).toContainEqual(now);
  });

  it("waits while the interval has not passed", async () => {
    const user = await userWithTrackedCompany();
    await checkedHoursAgo(user.id, 5);

    await runAutoChecks(testDb, { now, isStartup: false });

    expect(await runsOf(user.id)).toHaveLength(1);
  });

  it("uses the interval the user chose", async () => {
    const user = await userWithTrackedCompany();
    await setAutoCheckInterval(testDb, user.id, 3);
    await checkedHoursAgo(user.id, 4);

    await runAutoChecks(testDb, { now, isStartup: false });

    expect(await runsOf(user.id)).toHaveLength(2);
  });

  it("checks on startup when the last check is over an hour old", async () => {
    // The 6-hour interval has not passed yet, but the rule is different at startup.
    const user = await userWithTrackedCompany();
    await checkedHoursAgo(user.id, 2);

    await runAutoChecks(testDb, { now, isStartup: true });

    expect(await runsOf(user.id)).toHaveLength(2);
  });

  it("skips the startup check when the last check is fresh", async () => {
    const user = await userWithTrackedCompany();
    await checkedHoursAgo(user.id, 0.5);

    await runAutoChecks(testDb, { now, isStartup: true });

    expect(await runsOf(user.id)).toHaveLength(1);
  });

  it("skips while a general check is still running", async () => {
    // An auto-check that falls due during another one is skipped. The count goes
    // from the start of the one in progress, so it is not even time yet here -
    // we check both startup rules.
    const user = await userWithTrackedCompany();
    await testDb
      .insert(checkRuns)
      .values({ userId: user.id, startedAt: hoursBefore(7) });

    await runAutoChecks(testDb, { now, isStartup: true });

    expect(await runsOf(user.id)).toHaveLength(1);
  });

  it("decides for each user separately", async () => {
    const due = await userWithTrackedCompany();
    const fresh = await userWithTrackedCompany("other@job-digger.local");
    await checkedHoursAgo(due.id, 6);
    await checkedHoursAgo(fresh.id, 1);

    await runAutoChecks(testDb, { now, isStartup: false });

    expect(await runsOf(due.id)).toHaveLength(2);
    expect(await runsOf(fresh.id)).toHaveLength(1);
  });

  it("does nothing for a user with nothing to check", async () => {
    const user = await seedSystemUser(testDb);

    await runAutoChecks(testDb, { now, isStartup: false });

    expect(await runsOf(user.id)).toHaveLength(0);
  });
});
