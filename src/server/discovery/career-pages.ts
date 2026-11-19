/**
 * Другий спосіб пошуку: кар'єрні сторінки на сайті самої компанії
 * (docs/discovery-and-parsing.md, розділ 5, пункт 3) - посилання Careers / Jobs /
 * Karriere / Вакансії, типові адреси, sitemap.
 */
import * as cheerio from "cheerio";

import { boardUrlOf } from "./board-url.ts";

/**
 * Слова, які роблять сегмент шляху кар'єрним. Лише цілий сегмент: `/jobs` -
 * так, `/jobsite-safety` - ні.
 */
const PATH_WORDS = new Set([
  "career",
  "careers",
  "jobs",
  "join-us",
  "work-with-us",
  "open-positions",
  "vacancies",
  "karriere",
  "stellenangebote",
  "jobs-karriere",
  "kariera",
  "praca",
  "vacatures",
  "werken-bij",
  "carrieres",
  "emplois",
  "empleo",
  "trabaja-con-nosotros",
  "vakansii",
  "vacancy",
]);

/** Перша мітка хоста, з якою піддомен сайту - кар'єрний (`careers.acme.com`). */
const HOST_WORDS = new Set(["careers", "career", "jobs", "karriere"]);

/**
 * Текст посилання, з яким воно кар'єрне. Слово має стояти окремо: межа -
 * будь-що, крім літери, бо `\b` у JavaScript кирилиці не бачить.
 */
const TEXT_WORDS = new RegExp(
  `(^|[^\\p{L}])(${[
    "careers?",
    "jobs",
    "join us",
    "work with us",
    "we're hiring",
    "open positions",
    "vacancies",
    "karriere",
    "stellenangebote",
    "kariera",
    "praca",
    "vacatures",
    "werken bij",
    "carrières",
    "emplois",
    "empleo",
    "вакансії",
    "кар['ʼ’]єра",
    "вакансии",
    "карьера",
  ].join("|")})($|[^\\p{L}])`,
  "iu",
);

/**
 * Кар'єрні сторінки сайту, на які веде сторінка, - по одній, у порядку появи.
 *
 * Береться лише свій сайт: той самий хост без `www.` або його піддомен. Чужа
 * сторінка «Careers» належності компанії не доводить, а дошки ATS знаходить
 * `atsLinksOnPage`.
 *
 * Посилання на вакансію обрізається по кар'єрний сегмент: `/careers/designer-12`
 * дає `/careers`, тож список вакансій на головній дає одну сторінку.
 */
export function careerPagesOnPage(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const page = new URL(pageUrl);
  const site = withoutWww(page.hostname);
  const found = new Set<string>();

  $("a[href]").each((_, element) => {
    const $element = $(element);
    const address = $element.attr("href") ?? "";
    const text = $element.text().replace(/\s+/g, " ").trim();
    const career = careerPageOf(address, text, page, site);

    if (career !== null) {
      found.add(career);
    }
  });

  return [...found];
}

/**
 * Кар'єрні сторінки сайту з його sitemap (https://www.sitemaps.org/protocol.html):
 * адреси з `<url><loc>`, у шляху яких є кар'єрне слово, обрізані по нього.
 *
 * Тексту посилання тут немає, тож рахується лише шлях і піддомен. Вкладені
 * sitemap (`<sitemapindex>`) не читаються: кожен - ще один запит до чужого сайту.
 */
export function careerPagesInSitemap(xml: string, siteUrl: string): string[] {
  // `xml: true` - розбір як XML, а не HTML (node_modules/cheerio/dist/esm/options.d.ts).
  const $ = cheerio.load(xml, { xml: true });
  const site = new URL(siteUrl);
  const found = new Set<string>();

  $("url > loc").each((_, element) => {
    const career = careerPageOf(
      $(element).text().trim(),
      "",
      site,
      withoutWww(site.hostname),
    );

    if (career !== null) {
      found.add(career);
    }
  });

  return [...found];
}

function careerPageOf(
  address: string,
  text: string,
  page: URL,
  site: string,
): string | null {
  let url: URL;

  try {
    url = new URL(address, page);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (!isSameSite(url.hostname, site) || boardUrlOf(url.toString()) !== null) {
    return null;
  }

  // Якір на тій самій сторінці (`#careers`) - не окрема сторінка.
  if (url.origin === page.origin && url.pathname === page.pathname) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const word = segments.findIndex((segment) =>
    PATH_WORDS.has(segment.toLowerCase()),
  );

  if (word !== -1) {
    return `${url.origin}/${segments.slice(0, word + 1).join("/")}`;
  }

  const [label] = url.hostname.split(".");
  if (
    (label !== undefined && HOST_WORDS.has(label) && url.hostname !== site) ||
    TEXT_WORDS.test(text)
  ) {
    return `${url.origin}${url.pathname}`;
  }

  return null;
}

function withoutWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Той самий сайт: хост без `www.` збігається або є його піддоменом. */
function isSameSite(host: string, site: string): boolean {
  const bare = withoutWww(host);
  return bare === site || bare.endsWith(`.${site}`);
}
