/**
 * Рішення Find new pages для однієї компанії Not tracked (docs/ui.md, розділ
 * 4.3; задача 5.10): які знахідки додати джерелами без людини і який статус
 * поставити, якщо відстежувати так і нічого.
 */
import type { DiscoveryStatus } from "../../lib/companies/company-list.ts";
import { isReliableFinding, type Finding } from "./discover.ts";

export interface NewPagesInput {
  findings: Finding[];
  /** Сайт компанії не відповів: про сторінки на ньому нічого не відомо. */
  siteFailed: boolean;
  /** Адреси знахідок, які вже відстежує інша компанія користувача. */
  taken: ReadonlySet<string>;
  /**
   * Адреси знахідок, які вже є джерелами самої компанії: на статус вони
   * впливають (власна сторінка, збережена минулого разу, - це все ще
   * Unsupported), але вдруге не додаються.
   */
  owned: ReadonlySet<string>;
}

export interface NewPagesDecision {
  /** Адреси, які стають джерелами компанії. */
  add: string[];
  /**
   * Новий `discovery_status`, або `null` - компанія з доданою дошкою
   * переходить у Tracked, і статус вкладки Not tracked її не стосується.
   */
  status: DiscoveryStatus | null;
}

/**
 * Додаються без людини лише надійні знахідки (`isReliableFinding`), що
 * читаються, і власні сторінки з сайту компанії: їх читати поки нічим, але
 * адреса зберігається - знадобиться, коли зʼявиться парсер. Знахідка, яку вже
 * відстежує інша компанія, не додається ніколи: Save однаково відмовив би
 * `source-taken` (задача 5.08).
 *
 * Статус, коли дошку не додано, - від найкориснішого для людини:
 * `possible_page` (є що підтвердити через Find pages), `check_failed` (сайт чи
 * дошка не відповіли - варто повторити), `unsupported` (є лише власна
 * сторінка), `not_found`.
 */
export function decideNewPages({
  findings,
  siteFailed,
  taken,
  owned,
}: NewPagesInput): NewPagesDecision {
  const free = findings.filter((finding) => !taken.has(finding.url));
  const reliable = free.filter(isReliableFinding);
  const boards = reliable.filter((finding) => finding.trial.kind === "read");
  const ownPages = reliable.filter(
    (finding) => finding.trial.kind === "unsupported",
  );
  const add = [...boards, ...ownPages]
    .map((finding) => finding.url)
    .filter((url) => !owned.has(url));

  if (boards.length > 0) {
    return { add, status: null };
  }

  if (free.some((finding) => finding.trial.kind === "read")) {
    return { add, status: "possible_page" };
  }

  if (siteFailed || free.some((finding) => finding.trial.kind === "failed")) {
    return { add, status: "check_failed" };
  }

  return { add, status: ownPages.length > 0 ? "unsupported" : "not_found" };
}
