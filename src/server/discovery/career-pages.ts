/**
 * Другий спосіб пошуку: кар'єрні сторінки на сайті самої компанії
 * (src/server/discovery/README.md) - посилання Careers / Jobs /
 * Karriere / Вакансії, типові адреси, sitemap.
 */
import * as cheerio from "cheerio";

import type { HttpClient } from "../http/client.ts";
import { fetchText } from "../parsers/shared.ts";
import { atsLinksOnPage } from "./ats-links.ts";
import { boardKey, boardUrlOf, type BoardUrl } from "./board-url.ts";

/** Типові адреси кар'єрної сторінки - лише коли на головній посилання немає. */
const USUAL_PATHS = ["/careers", "/jobs"];

/**
 * Скільки кар'єрних сторінок читаємо. Кожна - запит до чужого сайту з паузою
 * ввічливості, а більше трьох окремих кар'єрних розділів у компанії не буває.
 */
const MAX_CAREER_PAGES = 3;

/** Що дали кар'єрні сторінки сайту. */
export type SiteCareerPages = {
  /** Дошки ATS, на які ведуть кар'єрні сторінки. */
  boards: BoardUrl[];
  /** Кар'єрні сторінки без посилань на ATS - власні сторінки компанії. */
  pages: string[];
};

/** Прочитана сторінка: тіло й адреса після редиректів. */
type Page = { body: string; url: string };

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
 * Текст посилання, з яким воно кар'єрне: увесь текст - кар'єрна фраза, без
 * розділових знаків і стрілок по краях. Не «містить слово»: «Career guides» і
 * «Read our jobs report» - не кар'єрні сторінки (Grammarly, 19.11.2026).
 */
const TEXT_WORDS = new RegExp(
  `^(${[
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
  ].join("|")})$`,
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
    TEXT_WORDS.test(trimToLetters(text))
  ) {
    return `${url.origin}${url.pathname}`;
  }

  return null;
}

/** Текст без небуквених символів по краях: «Careers →» стає «Careers». */
function trimToLetters(text: string): string {
  return text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

/**
 * Чи сама адреса кар'єрна: кар'єрний сегмент шляху або піддомен. Потрібно після
 * редиректу - тексту посилання там уже немає.
 */
function isCareerAddress(address: string): boolean {
  const url = new URL(address);
  const [label] = url.hostname.split(".");

  return (
    url.pathname
      .split("/")
      .some((segment) => PATH_WORDS.has(segment.toLowerCase())) ||
    (label !== undefined && HOST_WORDS.has(label))
  );
}

function withoutWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/** Той самий сайт: хост без `www.` збігається або є його піддоменом. */
function isSameSite(host: string, site: string): boolean {
  const bare = withoutWww(host);
  return bare === site || bare.endsWith(`.${site}`);
}

/**
 * Кар'єрні сторінки сайту і дошки ATS, на які вони ведуть (задача 5.03).
 *
 * `home` - уже прочитана головна (її читав пошук посилань на ATS, 5.02). Порядок
 * - від дешевшого для чужого сайту: посилання з головної; без них - типові
 * адреси; без тих - sitemap. Знайдені сторінки (до `MAX_CAREER_PAGES`)
 * читаються, і посилання з них на ATS стають дошками. Сторінка без ATS -
 * власна сторінка компанії; чи її можна прочитати, вирішує пробне читання (5.06).
 *
 * Сторінка, що не відповіла, просто не знахідка: головна вже прочиталась, і
 * збій однієї сторінки не робить невдалим увесь пошук.
 */
export async function findSiteCareerPages(
  home: Page,
  client: HttpClient,
): Promise<SiteCareerPages> {
  const candidates = await careerCandidates(home, client);
  const boards = new Map<string, BoardUrl>();
  // Множина: дві адреси можуть редиректити на одну сторінку (Grammarly,
  // 19.11.2026 - і `/careers`, і `/jobs` ведуть на `superhuman.com`).
  const pages = new Set<string>();

  for (const candidate of candidates.slice(0, MAX_CAREER_PAGES)) {
    const page =
      typeof candidate === "string"
        ? await readPage(client, candidate)
        : candidate;

    if (page === null) {
      continue;
    }

    const linked = atsLinksOnPage(page.body, page.url);
    for (const board of linked) {
      if (!boards.has(boardKey(board))) {
        boards.set(boardKey(board), board);
      }
    }
    if (linked.length === 0) {
      pages.add(withoutQuery(page.url));
    }
  }

  return { boards: [...boards.values()], pages: [...pages] };
}

/**
 * Кар'єрні сторінки-кандидати: адреси, які ще треба прочитати, або вже
 * прочитані сторінки (типова адреса читається, щоб дізнатися, чи вона є).
 */
async function careerCandidates(
  home: Page,
  client: HttpClient,
): Promise<Array<string | Page>> {
  const linked = careerPagesOnPage(home.body, home.url);
  if (linked.length > 0) {
    return linked;
  }

  const origin = new URL(home.url).origin;
  const usual: Page[] = [];
  for (const path of USUAL_PATHS) {
    const page = await readPage(client, `${origin}${path}`);
    if (page !== null) {
      usual.push(page);
    }
  }
  if (usual.length > 0) {
    return usual;
  }

  const sitemap = await fetchText(client, `${origin}/sitemap.xml`);
  return sitemap.ok ? careerPagesInSitemap(sitemap.body, home.url) : [];
}

/**
 * Кар'єрна сторінка за адресою або `null`, якщо вона не відповіла або редирект
 * завів туди, де кар'єри вже не видно: на сторінку помилки, що відповідає 200
 * (Palantir, 19.11.2026), чи на головну замість неіснуючого `/careers`.
 */
async function readPage(client: HttpClient, url: string): Promise<Page | null> {
  const page = await fetchText(client, url);

  if (!page.ok) {
    return null;
  }

  const moved = withoutQuery(page.url) !== withoutQuery(url);
  return moved && !isCareerAddress(page.url)
    ? null
    : { body: page.body, url: page.url };
}

function withoutQuery(address: string): string {
  const url = new URL(address);
  return `${url.origin}${url.pathname}`;
}
