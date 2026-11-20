/**
 * Резервна копія бази з `DATABASE_URL` у теку `BACKUP_DIR` (задача 6.09).
 *
 * - `npm run db:backup` - копія зараз; так її робить `npm run app:update`
 *   перед міграціями;
 * - `npm run app` - з `--if-due`: лише якщо остання копія старша за добу.
 *
 * `pg_dump` - з образу `postgres` через `docker exec`, тож версія збігається
 * з сервером і нова залежність не потрібна. Пароль не потрібен: усередині
 * контейнера підключення локальне, як у `npm run db:psql`.
 *
 * Копія пишеться в `.partial` і перейменовується лише після успіху - обірвана
 * копія не вважається свіжою й не витісняє справжніх. Тека не створюється:
 * друкарська помилка в `BACKUP_DIR` має бути помилкою, а не новою текою.
 * Службовий скрипт, у застосунок не імпортується.
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

/** `container_name` у `docker-compose.yml`. */
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

/** `pg_dump` у форматі custom (`-Fc`) - його читає `pg_restore`. */
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
