import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Кожен файл коду в `src/` згаданий у README поруч із ним.
 *
 * Правило «документація оновлюється разом зі зміною» (`CLAUDE.md`) само себе
 * не перевіряє: перелік компонентів у `src/app/README.md` двічі відстав від
 * коду, причому вдруге - одразу після того, як про це завели картку (2.18).
 * Уважність тут не працює, тому перевіряє тест.
 *
 * **Що вважається згадкою.** Для кожного файлу шукається найближчий README
 * вгору по дереву, аж до кореня репозиторію. Файл згаданий, якщо README
 * містить його шлях відносно своєї теки (`companies/page.tsx`,
 * `src/i18n/request.ts`) - або просто імʼя, але лише коли воно в межах цього
 * README унікальне. Інакше згадка `actions.ts` для `companies/` зараховувала б
 * і `settings/actions.ts`.
 *
 * **Чого тест не ловить:** застарілого опису файлу (згадка є, але бреше) і
 * згадки, що лишилася після видалення файлу. Перше - свідоме обмеження з картки
 * 2.18: зміст опису перевірити нічим, крім очей.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/** Тести - не код, який треба описувати: їхні назви повторюють назви модулів. */
const isTest = (file: string) => /\.test\.tsx?$/.test(file);

function codeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return codeFiles(path);
    }

    return /\.tsx?$/.test(entry.name) && !isTest(entry.name) ? [path] : [];
  });
}

/** Найближчий README.md від теки файлу вгору до кореня репозиторію. */
function nearestReadme(file: string): string {
  let directory = dirname(file);

  while (true) {
    const candidate = join(directory, "README.md");

    if (existsSync(candidate)) {
      return candidate;
    }

    if (directory === REPO_ROOT) {
      throw new Error(`No README.md above ${file}`);
    }

    directory = dirname(directory);
  }
}

/** Шлях у тому вигляді, у якому його пишуть у README: зі скісними рисками. */
function asPosix(path: string): string {
  return path.split(sep).join(posix.sep);
}

describe("README coverage", () => {
  it("mentions every source file in the README next to it", () => {
    const byReadme = new Map<string, string[]>();

    for (const file of codeFiles(SRC)) {
      const readme = nearestReadme(file);

      byReadme.set(readme, [...(byReadme.get(readme) ?? []), file]);
    }

    const missing: string[] = [];

    for (const [readme, files] of byReadme) {
      const text = readFileSync(readme, "utf8");
      const names = files.map((file) => basename(file));

      for (const file of files) {
        const name = basename(file);
        const path = asPosix(relative(dirname(readme), file));
        const unique = names.filter((other) => other === name).length === 1;

        if (!text.includes(path) && !(unique && text.includes(name))) {
          missing.push(
            `${asPosix(relative(REPO_ROOT, file))} → ${asPosix(relative(REPO_ROOT, readme))}`,
          );
        }
      }
    }

    // Список, а не перше падіння: так одразу видно весь борг документації.
    expect(missing).toEqual([]);
  });
});
