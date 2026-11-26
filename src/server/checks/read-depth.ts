/**
 * The read depth of general check tasks (task 6.16). The full table of "who reads
 * how much" is in the README next to this file, "Read depth".
 */
import type { ReadDepth } from "../parsers/vacancies-to-check.ts";

/** A full read in an auto-check - at most once a day per source. */
export const FULL_READ_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * - `first-page` - a manual Check all: only the first page of each source;
 * - `auto` - an auto-check: in full if the source has not been read in full for a
 *   day or longer, otherwise the first page.
 */
export type CheckAllDepthMode = "first-page" | "auto";

export function taskReadDepth({
  mode,
  lastFullReadAt,
  now,
}: {
  mode: CheckAllDepthMode;
  lastFullReadAt: Date | null;
  now: Date;
}): ReadDepth {
  if (mode === "first-page") {
    return "first-page";
  }

  return lastFullReadAt === null ||
    now.getTime() - lastFullReadAt.getTime() >= FULL_READ_EVERY_MS
    ? "full"
    : "first-page";
}
