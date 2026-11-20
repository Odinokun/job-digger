/**
 * Чиста логіка резервних копій робочої бази (задача 6.09): назви файлів, чи
 * вже час нової копії і які старі видаляти. Сам `pg_dump` - `backup.ts`.
 */
import path from "node:path";

/** Скільки копій тримати - рішення автора 20.11.2026. */
export const BACKUPS_TO_KEEP = 30;

/** Не частіше ніж раз на добу: `npm run app` запускається й кілька разів на день. */
export const BACKUP_EVERY_MS = 24 * 60 * 60 * 1000;

/** `2026-11-20T13-45-07Z`: ISO без мілісекунд, `:` замінені - їх не любить Finder. */
const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/;

export function backupFileName(databaseName: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");

  return `${databaseName}-${stamp}.dump`;
}

/** Час копії з назви файлу або `null`, якщо це не готова копія цієї бази. */
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

/** Копії цієї бази, від найновішої. */
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

/** Старші копії понад `keep`. Чужих файлів у теці не чіпає. */
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
 * `BACKUP_DIR`: порожньо - копій немає (так у теці розробки). Шлях лише
 * абсолютний: `~` у `.env` ніхто не розгорне.
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
