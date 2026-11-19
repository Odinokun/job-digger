/**
 * Належність знахідки компанії (docs/discovery-and-parsing.md, розділ 5,
 * пункт 4): дошку, знайдену лише за назвою, прив'язуємо до компанії, тільки
 * якщо сама дошка веде на сайт компанії.
 */
import * as cheerio from "cheerio";

/** Що сторінка дошки каже про свою компанію. */
export type BoardOwnership =
  /** Дошка веде на сайт компанії - знахідка надійна. */
  | { kind: "confirmed" }
  /** Дошка називає своїм інший сайт - схоже, інша компанія з такою назвою. */
  | { kind: "other"; site: string }
  /** Ні того, ні іншого не видно. */
  | { kind: "unknown" };

/**
 * Явні сигнали «сайт цієї компанії» на сторінці дошки. Лише за ними дошку
 * можна віднести до іншої компанії: будь-яке зовнішнє посилання (LinkedIn,
 * політика конфіденційності) такого не означає.
 *
 * - Lever: логотип у шапці і «{Company} Home Page» у футері;
 * - Ashby: поле `publicWebsite` у даних сторінки (`ASHBY_WEBSITE`).
 */
const WEBSITE_LINKS = "a.main-header-logo[href], .main-footer-text a[href]";

/** Ashby малює дошку JavaScript-ом, а сайт організації кладе в JSON сторінки. */
const ASHBY_WEBSITE = /"publicWebsite"\s*:\s*"(https?:[^"]+)"/g;

/**
 * Хости самих платформ: посилання на них - про платформу, а не про компанію
 * (логотип Lever без сайту компанії веде на саму дошку).
 */
const PLATFORM_DOMAINS = [
  "lever.co",
  "greenhouse.io",
  "greenhouse.com",
  "ashbyhq.com",
  "peopleforce.io",
  "myworkdayjobs.com",
  "myworkdaysite.com",
];

/**
 * Чия це дошка, з погляду компанії із сайтом `companySiteUrl`.
 *
 * Підтверджує будь-яке посилання на сайт компанії: якщо дошка хоч десь веде
 * туди, звʼязок двосторонній - назва збіглась, і дошка сама показує на сайт.
 * Той самий сайт - той самий хост без `www.` або піддомен в будь-який бік
 * (`careers.palantir.com` і `palantir.com`).
 */
export function boardOwnership(
  html: string,
  companySiteUrl: string,
): BoardOwnership {
  const site = bareHost(new URL(companySiteUrl).hostname);
  const $ = cheerio.load(html);

  const websites = [
    ...$(WEBSITE_LINKS)
      .map((_, element) => $(element).attr("href") ?? "")
      .get(),
    ...[...html.matchAll(ASHBY_WEBSITE)].map((match) => match[1] ?? ""),
  ]
    .map(hostOf)
    .filter((host): host is string => host !== null);

  const links = $("a[href]")
    .map((_, element) => hostOf($(element).attr("href") ?? ""))
    .get()
    .filter((host): host is string => host !== null);

  if ([...links, ...websites].some((host) => isSameSite(host, site))) {
    return { kind: "confirmed" };
  }

  const other = websites.find((host) => !isPlatform(host));
  return other === undefined
    ? { kind: "unknown" }
    : { kind: "other", site: other };
}

/** Хост абсолютної http(s)-адреси без `www.` або `null`. */
function hostOf(address: string): string | null {
  try {
    const url = new URL(address);
    return url.protocol === "http:" || url.protocol === "https:"
      ? bareHost(url.hostname)
      : null;
  } catch {
    return null;
  }
}

function bareHost(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

function isSameSite(host: string, site: string): boolean {
  return (
    host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`)
  );
}

function isPlatform(host: string): boolean {
  return PLATFORM_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}
