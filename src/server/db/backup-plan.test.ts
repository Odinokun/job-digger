import { describe, expect, it } from "vitest";

import {
  backupFileName,
  backupsToDelete,
  isBackupDue,
  latestBackupAt,
  parseBackupDir,
} from "./backup-plan.ts";

const NOW = new Date("2026-11-20T13:45:07.123Z");
const HOUR = 60 * 60 * 1000;

describe("backupFileName", () => {
  it("puts the database name and the UTC time into a sortable file name", () => {
    expect(backupFileName("job_digger_app", NOW)).toBe(
      "job_digger_app-2026-11-20T13-45-07Z.dump",
    );
  });
});

describe("latestBackupAt", () => {
  it("returns the time of the newest backup of this database", () => {
    const files = [
      "job_digger_app-2026-11-18T09-00-00Z.dump",
      "job_digger_app-2026-11-19T10-30-00Z.dump",
      "job_digger_app-2026-11-17T23-59-59Z.dump",
    ];

    expect(latestBackupAt("job_digger_app", files)).toEqual(
      new Date("2026-11-19T10:30:00Z"),
    );
  });

  it("ignores other databases, unfinished dumps and foreign files", () => {
    const files = [
      "job_digger-2026-11-19T10-30-00Z.dump",
      "job_digger_app-2026-11-20T10-30-00Z.dump.partial",
      "notes.txt",
      ".DS_Store",
    ];

    expect(latestBackupAt("job_digger_app", files)).toBeNull();
  });
});

describe("isBackupDue", () => {
  it("is due when there is no backup yet", () => {
    expect(isBackupDue(null, NOW)).toBe(true);
  });

  it("is not due within a day of the last backup", () => {
    expect(isBackupDue(new Date(NOW.getTime() - 23 * HOUR), NOW)).toBe(false);
  });

  it("is due once a day has passed", () => {
    expect(isBackupDue(new Date(NOW.getTime() - 24 * HOUR), NOW)).toBe(true);
  });
});

describe("backupsToDelete", () => {
  it("keeps the newest backups and returns the older ones", () => {
    const files = [
      "job_digger_app-2026-11-18T00-00-00Z.dump",
      "job_digger_app-2026-11-20T00-00-00Z.dump",
      "job_digger_app-2026-11-17T00-00-00Z.dump",
      "job_digger_app-2026-11-19T00-00-00Z.dump",
    ];

    expect(backupsToDelete("job_digger_app", files, 2)).toEqual([
      "job_digger_app-2026-11-18T00-00-00Z.dump",
      "job_digger_app-2026-11-17T00-00-00Z.dump",
    ]);
  });

  it("never touches files that are not backups of this database", () => {
    const files = [
      "job_digger_app-2026-11-20T00-00-00Z.dump",
      "job_digger-2026-11-01T00-00-00Z.dump",
      "other-backup.zip",
    ];

    expect(backupsToDelete("job_digger_app", files, 1)).toEqual([]);
  });
});

describe("parseBackupDir", () => {
  it("treats an empty value as backups turned off", () => {
    expect(parseBackupDir(undefined)).toBeNull();
    expect(parseBackupDir("  ")).toBeNull();
  });

  it("accepts an absolute path, spaces included", () => {
    expect(
      parseBackupDir(
        "/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Backups",
      ),
    ).toBe("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Backups");
  });

  it("rejects a relative path or ~, which nothing would expand", () => {
    expect(() => parseBackupDir("backups")).toThrow(/absolute/);
    expect(() => parseBackupDir("~/Backups")).toThrow(/absolute/);
  });
});
