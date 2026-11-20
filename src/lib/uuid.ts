/**
 * Чи має значення форму UUID. Id приходять із клієнта (аргументи Server
 * Action, курсор), а криве значення в колонці `uuid` - помилка бази, а не «не
 * знайдено».
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
