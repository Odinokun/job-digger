/**
 * Рядок Failed Sources Drawer (src/server/checks/README.md). Тип
 * спільний: його віддає сервер (`server/checks/failed-sources.ts`), а показує
 * клієнт.
 */

/** Причина збою - з `check_tasks.error`, без технічних подробиць. */
export type FailureReason =
  | "not-found"
  | "unreadable"
  | "bad-status"
  | "fetch-failed"
  | "stalled"
  | "abandoned"
  | "crashed";

export interface FailedSource {
  sourceId: string;
  companyName: string;
  url: string;
  /** Підпис джерела, якщо користувач його дав. */
  label: string | null;
  reason: FailureReason;
  /** Код відповіді сайту - лише для `bad-status`. */
  httpStatus: number | null;
  /** Retry поставлений у чергу й ще не завершився. */
  isRetrying: boolean;
}

export interface FailedSourcesList {
  items: FailedSource[];
  /** Retry доступний лише після завершення загальної перевірки. */
  canRetry: boolean;
}
