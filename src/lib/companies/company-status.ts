/**
 * Статус компанії на вкладці Tracked (docs/ui.md, розділ 4.2): OK - остання
 * перевірка без помилок, Has errors - є невдалі джерела, Checking - зараз
 * перевіряється.
 */
import type { CompanySource } from "./company-list";

export type CompanyCheckStatus = "ok" | "has-errors" | "checking";

export interface CompanyCheckStatusContext {
  /**
   * Йде загальна перевірка користувача - вона бере всі компанії Tracked, тож
   * кожна з них зараз перевіряється.
   */
  isGeneralCheckRunning: boolean;
}

/**
 * Статус із джерел, що відстежуються: сторінку без відстеження не
 * перевіряють, і її давній збій - не новина. `null` - жодне ще не
 * перевірялося, показувати нічого.
 */
export function companyCheckStatus(
  sources: CompanySource[],
  { isGeneralCheckRunning }: CompanyCheckStatusContext,
): CompanyCheckStatus | null {
  const tracked = sources.filter((source) => source.isTracked);

  if (tracked.length === 0) return null;
  if (isGeneralCheckRunning || tracked.some((source) => source.isChecking)) {
    return "checking";
  }
  if (tracked.some((source) => source.lastCheck === "failed")) {
    return "has-errors";
  }
  if (tracked.some((source) => source.lastCheck === "ok")) return "ok";

  return null;
}
