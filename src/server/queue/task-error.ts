/**
 * Помилка невдалого завдання - те, що лежить у `check_tasks.error` і що
 * показує Failed Sources Drawer.
 */
import type { ParserError } from "../parsers/types.ts";

export type CheckTaskError =
  /** Сайт або парсер: причина так, як її повернув парсер. */
  | ParserError
  /** Обробник щоразу зависав на завданні, і спроби скінчилися (`recover.ts`). */
  | { reason: "stalled" }
  /**
   * Запуск закрився, бо довго стояв без руху, а завдання так і не дійшло до
   * перевірки (`finalize.ts`).
   */
  | { reason: "abandoned" }
  /** Перевірка кинула виняток - помилка в нашому коді, а не на сайті (`run-task.ts`). */
  | { reason: "crashed" };
