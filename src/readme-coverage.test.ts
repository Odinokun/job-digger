import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Every code file in `src/` is mentioned in the README next to it.
 *
 * The rule "documentation changes together with the code" (`CLAUDE.md`) does not
 * check itself: the component list in `src/app/README.md` fell behind the code
 * twice, the second time right after a card was opened about it (2.18). Attention
 * does not work here, so a test checks.
 *
 * **What counts as a mention.** For each file the nearest README up the tree, up to
 * the repository root, is looked up. The file is mentioned if the README contains
 * its path relative to the README's folder (`companies/page.tsx`,
 * `src/i18n/request.ts`) - or just its name, but only when the name is unique within
 * that README. Otherwise a mention of `actions.ts` for `companies/` would also count
 * for `settings/actions.ts`.
 *
 * **What the test does not catch:** a stale file description (the mention is there
 * but wrong) and a mention left after the file was deleted. The first is a deliberate
 * limit from card 2.18: nothing but eyes can check the content of a description.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/** Tests are not code to describe: their names repeat the module names. */
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

/** The nearest README.md from the file's folder up to the repository root. */
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

/** The path in the form it is written in a README: with forward slashes. */
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

    // A list, not the first failure: this way the whole documentation debt is visible at once.
    expect(missing).toEqual([]);
  });
});
