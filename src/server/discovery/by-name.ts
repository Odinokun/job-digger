/**
 * Третій, найменш надійний спосіб пошуку: дошки ATS за назвою компанії
 * (docs/discovery-and-parsing.md, розділ 5, пункт 3). Такі знахідки - лише
 * «знайдено за назвою - перевір»: та сама назва дошки може належати іншій
 * компанії.
 */

/** Мітки хоста, що не є назвою компанії: `www.acme.com`, `careers.acme.com`. */
const SERVICE_LABELS = new Set([
  "www",
  "careers",
  "career",
  "jobs",
  "karriere",
]);

/**
 * Варіанти назви дошки з назви компанії й адреси її сайту, без повторів.
 *
 * - назва разом (`boschua`) і, якщо слів кілька, через дефіс (`bosch-ua`):
 *   платформи пишуть назву дошки однією з цих форм;
 * - перша мітка домену (`bosch` з `bosch.de/ua`), пропускаючи службові
 *   (`www`, `careers`).
 *
 * Діакритика знімається, усе, крім латинських літер і цифр, - роздільник. Назва
 * без латиниці («Монобанк») варіантів не дає.
 */
export function nameSlugs({
  name,
  siteUrl,
}: {
  name: string;
  siteUrl: string | null;
}): string[] {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const slugs = [words.join("")];
  if (words.length > 1) {
    slugs.push(words.join("-"));
  }
  if (siteUrl !== null) {
    slugs.push(domainLabel(siteUrl));
  }

  return [...new Set(slugs.filter((slug) => slug.length >= 2))];
}

function domainLabel(siteUrl: string): string {
  const labels = new URL(siteUrl).hostname.split(".");
  return labels.find((label) => !SERVICE_LABELS.has(label)) ?? "";
}
