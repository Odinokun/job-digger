/**
 * A backup of the `DATABASE_URL` database into the `BACKUP_DIR` folder (task 6.09).
 *
 * - `npm run db:backup` makes a backup now; `npm run app:update` does it this way
 *   before migrations;
 * - `npm run app` runs it with `--if-due`: only if the last backup is older than a day.
 *
 * `pg_dump` comes from the `postgres` image through `docker exec`, so its version
 * matches the server and no new dependency is needed. No password is needed:
 * inside the container the connection is local, as in `npm run db:psql`.
 *
 * The backup is written to `.partial` and renamed only on success - an aborted
 * backup does not count as fresh and does not push out real ones. The folder is
 * not created: a typo in `BACKUP_DIR` has to be an error, not a new folder.
 * A helper script, never imported into the app.
 */
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import {
  BACKUPS_TO_KEEP,
  backupFileName,
  backupsToDelete,
  isBackupDue,
  latestBackupAt,
  parseBackupDir,
} from "./backup-plan.ts";

/** `container_name` in `docker-compose.yml`. */
const CONTAINER = "job-digger-db";

const backupDir = parseBackupDir(process.env.BACKUP_DIR);

if (backupDir === null) {
  console.warn("BACKUP_DIR is not set, database backup skipped");
} else {
  await backUp(backupDir, { onlyIfDue: process.argv.includes("--if-due") });
}

async function backUp(
  dir: string,
  { onlyIfDue }: { onlyIfDue: boolean },
): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const url = new URL(databaseUrl);
  const user = decodeURIComponent(url.username);
  const database = decodeURIComponent(url.pathname.slice(1));
  const now = new Date();
  const existing = await readdir(dir).catch((error: unknown) => {
    throw new Error(`BACKUP_DIR "${dir}" is not a readable folder`, {
      cause: error,
    });
  });

  if (onlyIfDue && !isBackupDue(latestBackupAt(database, existing), now)) {
    return;
  }

  const target = path.join(dir, backupFileName(database, now));
  const partial = `${target}.partial`;

  try {
    await dump({ user, database, file: partial });
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }

  console.log("Database backup:", target);

  for (const old of backupsToDelete(
    database,
    await readdir(dir),
    BACKUPS_TO_KEEP,
  )) {
    await rm(path.join(dir, old));
  }
}

/** `pg_dump` in the custom format (`-Fc`), which `pg_restore` reads. */
async function dump({
  user,
  database,
  file,
}: {
  user: string;
  database: string;
  file: string;
}): Promise<void> {
  const child = spawn(
    "docker",
    ["exec", CONTAINER, "pg_dump", "-U", user, "-Fc", database],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const exitCode = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  const [, code] = await Promise.all([
    pipeline(child.stdout, createWriteStream(file)),
    exitCode,
  ]);

  if (code !== 0) {
    throw new Error(`pg_dump exited with code ${code}`);
  }
}
