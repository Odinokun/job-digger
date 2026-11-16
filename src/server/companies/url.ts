/** Чому адресу не можна використати. */
export type UrlRefusalReason = "empty" | "not-a-url" | "unsupported-scheme";

/**
 * Очищена форма адреси компанії - та, за якою адреси порівнюються між собою,
 * або причина, чому адресу взагалі не можна використати.
 */
export type NormalizedCompanyUrl =
  { ok: true; url: string } | { ok: false; reason: UrlRefusalReason };

/** Завантажуємо лише ці схеми (docs/security.md). */
const SUPPORTED_SCHEMES = ["http:", "https:"];

/** Протокол на початку рядка: `https:`, `ftp:` і будь-який інший. */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

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

  let parsed;
  try {
    // Користувач може вставити адресу без протоколу - тоді підставляємо https,
    // бо інакше `new URL` не розбере рядок зовсім.
    parsed = new URL(absoluteCompanyUrl(trimmed));
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

/**
 * Адреса в абсолютній формі: якщо протоколу немає, підставляється `https://`.
 *
 * Потрібна тому, що зберігати введену адресу як є не можна - без протоколу
 * `<a href>` у списку компаній став би відносним посиланням і вів у нікуди.
 * Решта адреси не змінюється: шлях, регістр і query лишаються, як ввів
 * користувач (`normalizeCompanyUrl` дає іншу, порівнянну форму).
 *
 * Функція нічого не перевіряє - придатність адреси встановлює
 * `normalizeCompanyUrl`, і викликати цю варто лише після його `ok`.
 */
export function absoluteCompanyUrl(input: string): string {
  const trimmed = input.trim();

  return SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
}
