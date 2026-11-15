/**
 * Очищена форма адреси компанії - та, за якою адреси порівнюються між собою,
 * або причина, чому адресу взагалі не можна використати.
 */
export type NormalizedCompanyUrl =
  | { ok: true; url: string }
  | { ok: false; reason: "empty" | "not-a-url" | "unsupported-scheme" };

/** Завантажуємо лише ці схеми (docs/security.md). */
const SUPPORTED_SCHEMES = ["http:", "https:"];

/**
 * Приводить адресу компанії до порівнянної форми: без протоколу, без `www.`,
 * без слеша в кінці, домен у нижньому регістрі. Шлях зберігається разом із
 * регістром, бо bosch.com/de і bosch.com/ua - різні компанії.
 */
export function normalizeCompanyUrl(input: string): NormalizedCompanyUrl {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: false, reason: "empty" };
  }

  // Користувач може вставити адресу без протоколу - тоді підставляємо https,
  // бо інакше `new URL` не розбере рядок зовсім.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);

  let parsed;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "not-a-url" };
  }

  if (!SUPPORTED_SCHEMES.includes(parsed.protocol)) {
    return { ok: false, reason: "unsupported-scheme" };
  }

  // URL сам приводить хост до нижнього регістру й до punycode.
  const host = parsed.host.replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");

  // Fragment відкидається - він лишається в браузері й не доходить до сервера.
  // Query лишається: ним іноді розрізняють національні версії сайту.
  return { ok: true, url: `${host}${path}${parsed.search}` };
}
