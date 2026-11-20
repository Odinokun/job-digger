/**
 * Власна кар'єрна сторінка компанії, прочитана за рецептом (задача 6.21).
 *
 * Сторінка не має формату платформи, тож вакансії на ній - посилання, що
 * повторюються: однакова форма адреси (`kinggroup.io/vacancies/design/<slug>`).
 * `findLinkGroups` пропонує такі групи людині, вона підтверджує одну, і її
 * префікс стає рецептом; далі `parseOwnPage` читає сторінку за ним. Рецепт -
 * форма адреси, а не CSS-класи: конструктори на кшталт Framer міняють класи
 * після кожної публікації сайту, адреси вакансій - ні.
 *
 * Правила й рішення - README.md поруч, розділ «Власна сторінка».
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

import type { HttpClient } from "../http/client.ts";
import { fetchText } from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/** Вакансія з власної сторінки так, як її бачить людина в діалозі підтвердження. */
export interface FoundLink {
  title: string;
  url: string;
}

/** Група посилань з однаковим префіксом адреси - кандидат у рецепт. */
export interface LinkGroup {
  /** Хост і шлях до останнього `/`: `kinggroup.io/vacancies/design/`. */
  prefix: string;
  vacancies: FoundLink[];
}

/** Скільки груп показує діалог підтвердження (рішення автора 20.11.2026). */
export const MAX_LINK_GROUPS = 3;

/**
 * Слова кар'єрних адрес: група з ними в шляху ймовірніше - вакансії, а не
 * послуги чи блог.
 */
const CAREER_WORDS =
  /career|job|vacanc|position|opening|role|hiring|ваканс|кар.?єр|робот/i;

/**
 * Текст кнопок, а не назв: «View & Apply» у delasport, «See more» у
 * codebridge. Назвою вакансії такий текст не буває.
 */
const ACTION_TEXTS = new Set([
  "apply",
  "apply now",
  "view & apply",
  "view and apply",
  "view",
  "details",
  "more",
  "see more",
  "read more",
  "learn more",
  "more info",
  "детальніше",
  "докладніше",
  "більше",
  "відгукнутися",
  "подати заявку",
]);

/** Клас елемента з назвою: `vacancies__title`, `career-item__position`. */
const TITLE_CLASS = /title|position|name|role-name|job-name/i;

/** Посилання сторінки, що можуть бути вакансіями. */
interface PageLink {
  url: string;
  prefix: string;
  /** Скільки сегментів у шляху: вакансія зазвичай глибша за сторінку списку. */
  depth: number;
  element: Element;
}

/**
 * Групи посилань, що можуть бути вакансіями, - найімовірніша перша, не більше
 * `MAX_LINK_GROUPS`. Порожній масив - на сторінці немає посилань свого сайту.
 *
 * Найімовірніша - глибша за саму сторінку (`/vacancies/tech` → вакансії
 * `/vacancies/design/<slug>`, а категорії `/vacancies/hr` - того самого рівня)
 * і з кар'єрним словом у шляху; далі - більша. Групи без жодної з цих ознак
 * (меню сайту, послуги) показуються, лише якщо інших немає.
 */
export function findLinkGroups(html: string, pageUrl: string): LinkGroup[] {
  const $ = cheerio.load(html);
  const links = pageLinks($, pageUrl);
  const pageDepth = pathSegments(new URL(pageUrl).pathname).length;

  const byPrefix = new Map<string, PageLink[]>();
  for (const link of links) {
    byPrefix.set(link.prefix, [...(byPrefix.get(link.prefix) ?? []), link]);
  }

  const scored = [...byPrefix].map(([prefix, group]) => {
    const deeper = group.some((link) => link.depth > pageDepth);
    const careerWord = CAREER_WORDS.test(prefix);
    const urls = new Set(group.map((link) => link.url));

    return { prefix, deeper, careerWord, size: urls.size };
  });
  const likely = scored.filter((group) => group.deeper || group.careerWord);

  return (likely.length > 0 ? likely : scored)
    .sort(
      (left, right) =>
        Number(right.deeper) - Number(left.deeper) ||
        Number(right.careerWord) - Number(left.careerWord) ||
        right.size - left.size,
    )
    .slice(0, MAX_LINK_GROUPS)
    .map(({ prefix }) => ({
      prefix,
      vacancies: vacanciesOf($, links, prefix),
    }));
}

/**
 * Вакансії сторінки за рецептом: посилання з префіксом `prefix` і ще одним
 * сегментом шляху. Порожній масив - на сторінці таких посилань немає (сайт
 * переробили); `readOwnPage` вважає це збоєм, а не тим, що вакансії закрито.
 */
export function parseOwnPage(
  html: string,
  pageUrl: string,
  prefix: string,
): ParsedVacancy[] {
  const $ = cheerio.load(html);

  return vacanciesOf($, pageLinks($, pageUrl), prefix).map((found) => ({
    // ID у власної сторінки немає: ключ складається з адреси (`key.ts`).
    externalId: null,
    title: found.title,
    url: found.url,
    location: null,
  }));
}

/**
 * Читає власну сторінку за рецептом. Сторінка без жодної вакансії за рецептом
 * - `unreadable`, а не порожній список: інакше переробка сайту «закрила» б
 * усі вакансії компанії (рішення автора 20.11.2026). Пагінації немає: на
 * жодній із 13 сторінок аналізу її не було в HTML, а Load more довантажує
 * JavaScript.
 */
export async function readOwnPage(
  sourceUrl: string,
  prefix: string,
  client: HttpClient,
): Promise<ParseResult> {
  const response = await fetchText(client, sourceUrl);
  if (!response.ok) return response;

  const vacancies = parseOwnPage(response.body, response.url, prefix);

  return vacancies.length === 0
    ? { ok: false, error: { reason: "unreadable" } }
    : { ok: true, vacancies, skipped: 0 };
}

/**
 * Посилання на сторінки того самого хоста, крім меню й підвалу сайту, якорів,
 * пошти й самої сторінки. Відносні адреси розв'язуються від `<base href>`,
 * якщо він є, інакше від адреси сторінки.
 */
function pageLinks($: cheerio.CheerioAPI, pageUrl: string): PageLink[] {
  const page = new URL(pageUrl);
  const baseHref = $("base[href]").first().attr("href");
  const base = baseHref === undefined ? page : safeUrl(baseHref, page);
  const self = withoutHash(page);
  const links: PageLink[] = [];

  $("a[href]").each((_, element) => {
    if ($(element).closest("nav, header, footer").length > 0) return;

    const url = safeUrl($(element).attr("href") ?? "", base ?? page);
    if (url === null) return;
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    if (url.host.toLowerCase() !== page.host.toLowerCase()) return;

    const address = withoutHash(url);
    if (address === self) return;

    const segments = pathSegments(url.pathname);
    if (segments.length === 0) return;

    links.push({
      url: address,
      prefix: prefixOf(url, segments),
      depth: segments.length,
      element,
    });
  });

  return links;
}

/** Вакансії групи `prefix` у порядку сторінки, кожна адреса - один раз. */
function vacanciesOf(
  $: cheerio.CheerioAPI,
  links: PageLink[],
  prefix: string,
): FoundLink[] {
  const group = links.filter((link) => link.prefix === prefix);
  const found = new Map<string, FoundLink>();

  for (const link of group) {
    if (found.has(link.url)) continue;

    const card = cardOf($, link.element, link.url);
    found.set(link.url, {
      title: titleOf($, card, link.element) ?? titleFromAddress(link.url),
      url: link.url,
    });
  }

  return [...found.values()];
}

/**
 * Картка вакансії - найбільший предок посилання, в якому всі посилання ведуть
 * на ту саму вакансію. У Framer це саме посилання, у delasport - блок із `h3`
 * і кнопкою «View & Apply», у ncube - блок із назвою і порожнім посиланням.
 */
function cardOf(
  $: cheerio.CheerioAPI,
  element: Element,
  url: string,
): cheerio.Cheerio<AnyNode> {
  let card: cheerio.Cheerio<AnyNode> = $(element);

  for (;;) {
    const parent = card.parent();
    if (parent.length === 0 || parent.is("body, html")) return card;

    const othersInside = parent
      .find("a[href]")
      .toArray()
      .some((anchor) => {
        const href = $(anchor).attr("href") ?? "";
        const resolved = safeUrl(href, new URL(url));
        return resolved === null || withoutHash(resolved) !== url;
      });
    if (othersInside) return card;

    card = parent;
  }
}

/**
 * Назва вакансії в картці, від надійнішого до запасного: заголовок; елемент із
 * класом назви (`vacancies__title` у ncube, `career-item__position` у
 * a-listware); власний текст посилання (headway: назва - саме посилання, а
 * відділ - довший рядок під ним); перший рядок тексту картки (codebridge: клас
 * `career-postiton` з помилкою, назва - перший рядок, а опис нижче довший).
 * Текст кнопок («View & Apply») назвою не буває. `null` - тексту немає.
 */
function titleOf(
  $: cheerio.CheerioAPI,
  card: cheerio.Cheerio<AnyNode>,
  link: Element,
): string | null {
  const headings = card
    .find("h1, h2, h3, h4, h5, h6")
    .addBack("h1, h2, h3, h4, h5, h6");
  const titled = card
    .find("[class]")
    .filter((_, element) => TITLE_CLASS.test($(element).attr("class") ?? ""));
  const linkLines = textLines($, $(link));

  return (
    firstText($, headings) ??
    firstText($, titled) ??
    (linkLines.length === 1 ? meaningful(linkLines[0]) : null) ??
    textLines($, card)
      .map(meaningful)
      .find((line) => line !== null) ??
    null
  );
}

/** Рядок, якщо він може бути назвою, - не порожній і не текст кнопки. */
function meaningful(line: string): string | null {
  return line === "" || ACTION_TEXTS.has(line.toLowerCase()) ? null : line;
}

/** Перший непорожній текст серед елементів, з однією пробільною розбивкою. */
function firstText(
  $: cheerio.CheerioAPI,
  elements: cheerio.Cheerio<AnyNode>,
): string | null {
  for (const element of elements.toArray()) {
    const text = meaningful(normalizeSpace($(element).text()));
    if (text !== null) return text;
  }

  return null;
}

/** Окремі рядки тексту картки - текстові вузли, без скриптів і стилів. */
function textLines(
  $: cheerio.CheerioAPI,
  card: cheerio.Cheerio<AnyNode>,
): string[] {
  const lines: string[] = [];

  card
    .find("*")
    .addBack()
    .contents()
    .each((_, node) => {
      if (node.type !== "text") return;
      const parent = node.parent as Element | null;
      if (parent !== null && ["script", "style"].includes(parent.name)) return;

      const text = normalizeSpace($(node).text());
      if (text !== "") lines.push(text);
    });

  return lines;
}

/** Остання частина адреси як назва: `senior-react-developer` → «senior react developer». */
function titleFromAddress(url: string): string {
  const segments = pathSegments(new URL(url).pathname);

  return normalizeSpace(
    decodeURIComponent(segments.at(-1) ?? url).replace(/[-_]+/g, " "),
  );
}

function prefixOf(url: URL, segments: string[]): string {
  const parent = segments.slice(0, -1);
  const path = parent.length === 0 ? "/" : `/${parent.join("/")}/`;

  return `${url.host.toLowerCase()}${path}`;
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment !== "");
}

function withoutHash(url: URL): string {
  const copy = new URL(url);
  copy.hash = "";

  return copy.href;
}

function safeUrl(href: string, base: URL): URL | null {
  try {
    return new URL(href.trim(), base);
  } catch {
    return null;
  }
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
