/**
 * The pure logic of working database backups (task 6.09): file names, whether a
 * new backup is due and which old ones to delete. `pg_dump` itself is in `backup.ts`.
 */
import path from "node:path";

/** How many backups to keep - the author's decision of 20.11.2026. */
export const BACKUPS_TO_KEEP = 30;

/** At most once a day: `npm run app` may start several times a day. */
export const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;

/** `2026-11-20T13-45-07Z`: ISO without milliseconds, with `:` replaced - Finder dislikes it. */
const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/;

export function backupFileName(databaseName: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");

  return `${databaseName}-${stamp}.dump`;
}

/** The backup time from a file name, or `null` if it is not a finished backup of this database. */
function backupTime(databaseName: string, fileName: string): Date | null {
  const prefix = `${databaseName}-`;

  if (!fileName.startsWith(prefix) || !fileName.endsWith(".dump")) {
    return null;
  }

  const match = STAMP.exec(fileName.slice(prefix.length, -".dump".length));

  return match === null
    ? null
    : new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`);
}

/** Backups of this database, newest first. */
function backupsNewestFirst(
  databaseName: string,
  fileNames: string[],
): { fileName: string; time: Date }[] {
  return fileNames
    .flatMap((fileName) => {
      const time = backupTime(databaseName, fileName);

      return time === null ? [] : [{ fileName, time }];
    })
    .sort((a, b) => b.time.getTime() - a.time.getTime());
}

export function latestBackupAt(
  databaseName: string,
  fileNames: string[],
): Date | null {
  return backupsNewestFirst(databaseName, fileNames)[0]?.time ?? null;
}

export function isBackupDue(latest: Date | null, now: Date): boolean {
  return latest === null || now.getTime() - latest.getTime() >= BACKUP_EVERY_MS;
}

/** Older backups beyond `keep`. Leaves other files in the folder alone. */
export function backupsToDelete(
  databaseName: string,
  fileNames: string[],
  keep: number,
): string[] {
  return backupsNewestFirst(databaseName, fileNames)
    .slice(keep)
    .map((backup) => backup.fileName);
}

/**
 * `BACKUP_DIR`: empty means no backups (as in the development folder). Only an
 * absolute path: nobody expands `~` in `.env`.
 */
export function parseBackupDir(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "") {
    return null;
  }

  if (!path.isAbsolute(trimmed)) {
    throw new Error(`BACKUP_DIR must be an absolute path, got "${trimmed}"`);
  }

  return trimmed;
}
