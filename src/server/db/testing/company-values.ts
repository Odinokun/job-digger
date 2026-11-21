import { normalizeCompanyUrl } from "../../../lib/companies/url.ts";

let nextSite = 0;

/**
 * Сайт компанії для прямої вставки в тестах: `url` і `normalized_url`.
 *
 * Обидві колонки обовʼязкові (задача company-site-required), а тестам, яким
 * сайт байдужий, потрібна лише будь-яка унікальна адреса: назва плюс номер
 * виклику на зарезервованому домені `.example` (RFC 2606). Номер - бо тести
 * створюють і дві компанії з однаковою назвою в одного користувача, а
 * унікальний індекс `(user_id, normalized_url)` таких сайтів не пропустив би.
 */
export function companySiteValues(name: string): {
  url: string;
  normalizedUrl: string;
} {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  nextSite += 1;
  const url = `https://${slug === "" ? "company" : slug}-${nextSite}.example`;
  const normalized = normalizeCompanyUrl(url);

  if (!normalized.ok) {
    throw new Error(`Test company site is unusable: ${url}`);
  }

  return { url, normalizedUrl: normalized.url };
}
