/**
 * The error of a failed task - what goes into `check_tasks.error` and what the
 * Failed Sources Drawer shows.
 */
import type { ParserError } from "../parsers/types.ts";

export type CheckTaskError =
  /** The site or the parser: the reason as the parser returned it. */
  | ParserError
  /** The worker got stuck on the task every time, and the attempts ran out (`recover.ts`). */
  | { reason: "stalled" }
  /**
   * The run was closed because it stood without movement for a long time, and the
   * task never reached its check (`finalize.ts`).
   */
  | { reason: "abandoned" }
  /** The check threw an exception - a bug in our code, not on the site (`run-task.ts`). */
  | { reason: "crashed" };
