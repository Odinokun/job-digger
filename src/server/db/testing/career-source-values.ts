import { normalizeCompanyUrl } from "../../../lib/companies/url.ts";

/**
 * Очищена адреса для прямої вставки карʼєрного джерела в тестах.
 *
 * `career_sources.normalized_url` заповнюється завжди, і в застосунку це робить
 * `prepareCareerSource`. Тести вставляють рядки повз нього - як заготовку, а не
 * як перевірку правила, - тому їм потрібне те саме обчислення, але без решти
 * підготовки джерела.
 *
 * Руками записувати очищену форму в кожному тесті не можна: тоді правило
 * нормалізації жило б і в коді, і в десятку літералів, і розійшлося б при
 * першій же зміні.
 *
 * Непридатна адреса тут - помилка в самому тесті, тому виняток.
 */
export function normalizedSourceUrl(url: string): string {
  const normalized = normalizeCompanyUrl(url);

  if (!normalized.ok) {
    throw new Error(`Test career source url is unusable: ${url}`);
  }

  return normalized.url;
}
