import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Переклади інтерфейсу живуть у двох файлах, і набір ключів у них мусить бути
 * однаковий: ключ, доданий лише в одну мову, в іншій покаже сире імʼя ключа
 * замість тексту. Цей тест - єдина автоматична перевірка цієї умови.
 */
const locales = ["en", "uk"] as const;

type Messages = { [key: string]: string | Messages };

function readMessages(locale: string): Messages {
  const path = new URL(`../../messages/${locale}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as Messages;
}

// Повні шляхи всіх ключів: вкладені обʼєкти дають "Nav.jobs", а не просто
// "jobs", тож переїзд ключа в інший розділ теж помітний.
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
