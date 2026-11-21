/**
 * `AUTO_CHECK=off` повністю вимикає автоматичні перевірки, зокрема перевірку
 * на старті (src/server/checks/README.md). Ручні перевірки працюють.
 * Потрібно на час розробки і в E2E: там розклад запускав би загальну
 * перевірку посеред сценарію.
 *
 * Хибне значення - помилка на старті, як і в `PARALLEL_SOURCE_CHECKS`: хто
 * написав `AUTO_CHECK=false`, явно хотів вимкнути, і тихо лишити перевірки
 * ввімкненими було б гірше.
 */
export function parseAutoCheckEnabled(raw: string | undefined): boolean {
  const value = raw?.trim() ?? "";

  if (value === "" || value === "on") {
    return true;
  }

  if (value === "off") {
    return false;
  }

  throw new Error(`AUTO_CHECK must be "on", "off" or empty, got: ${raw}`);
}
