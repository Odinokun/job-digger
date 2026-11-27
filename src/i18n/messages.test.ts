import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * UI translations live in two files, and their key sets must be the same: a key
 * added to only one language shows the raw key name instead of text in the other.
 * This test is the only automatic check of that condition.
 */
const locales = ["en", "uk"] as const;

type Messages = { [key: string]: string | Messages };

function readMessages(locale: string): Messages {
  const path = new URL(`../../messages/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Messages;
}

// Full paths of all keys: nested objects give "Nav.jobs", not just "jobs", so a key
// moving to another section is noticed too.
function collectKeyPaths(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : collectKeyPaths(value, path);
  });
}

describe("translation messages", () => {
  it("use the same set of keys in every locale", () => {
    const [reference, ...others] = locales.map((locale) => ({
      locale,
      keys: collectKeyPaths(readMessages(locale)).sort(),
    }));

    for (const other of others) {
      expect(other.keys, `keys of ${other.locale}.json`).toEqual(
        reference.keys,
      );
    }
  });

  it("has no empty translations", () => {
    for (const locale of locales) {
      const messages = readMessages(locale);
      for (const path of collectKeyPaths(messages)) {
        const value = path
          .split(".")
          .reduce<string | Messages>(
            (node, key) => (node as Messages)[key],
            messages,
          );
        expect(value, `${locale}.json: ${path}`).not.toBe("");
      }
    }
  });
});
