/**
 * A company's own career page, read by a recipe (task 6.21).
 *
 * The page has no platform format, so its vacancies are repeating links with the
 * same address form (`kinggroup.io/vacancies/design/<slug>`). `findLinkGroups`
 * offers such groups to a person, who confirms one, and its prefix becomes the
 * recipe; from then on `parseOwnPage` reads the page by it. The recipe is an
 * address form, not CSS classes: builders like Framer change classes after
 * every site publish, vacancy addresses they do not.
 *
 * Rules and decisions: the README next to this file, section "Own page".
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";

import type { HttpClient } from "../http/client.ts";
import { fetchText } from "./shared.ts";
import type { ParsedVacancy, ParseResult } from "./types.ts";

/** A vacancy from an own page as a person sees it in the confirmation dialog. */
export interface FoundLink {
  title: string;
  url: string;
}

/** A group of links with the same address prefix - a recipe candidate. */
export interface LinkGroup {
  /** The host and the path up to the last `/`: `kinggroup.io/vacancies/design/`. */
  prefix: string;
  vacancies: FoundLink[];
}

/** How many groups the confirmation dialog shows (the author's decision of 20.11.2026). */
export const MAX_LINK_GROUPS = 3;

/**
 * Words of career addresses: a group with them in the path is more likely to be
 * vacancies than services or a blog.
 */
const CAREER_WORDS =
  /career|job|vacanc|position|opening|role|hiring|ваканс|кар.?єр|робот/i;

/**
 * Button texts, not titles: "View & Apply" at delasport, "See more" at
 * codebridge. Such text is never a vacancy title.
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

/** The class of the element with the title: `vacancies__title`, `career-item__position`. */
const TITLE_CLASS = /title|position|name|role-name|job-name/i;

/** Page links that may be vacancies. */
interface PageLink {
  url: string;
  prefix: string;
  /** How many segments the path has: a vacancy is usually deeper than the list page. */
  depth: number;
  element: Element;
}

/**
 * Groups of links that may be vacancies - the most likely first, at most
 * `MAX_LINK_GROUPS`. An empty array means the page has no links to its own site.
 *
 * The most likely is deeper than the page itself (`/vacancies/tech` → vacancies
 * `/vacancies/design/<slug>`, while the `/vacancies/hr` categories are on the
 * same level) and has a career word in the path; after that, the larger one.
 * Groups with neither sign (the site menu, services) are shown only if there
 * are no others.
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
 * The page's vacancies by recipe: links with the `prefix` prefix and one more
 * path segment. An empty array means the page has no such links (the site was
 * redone); `readOwnPage` treats this as a failure, not as closed vacancies.
 */
export function parseOwnPage(
  html: string,
  pageUrl: string,
  prefix: string,
): ParsedVacancy[] {
  const $ = cheerio.load(html);

  return vacanciesOf($, pageLinks($, pageUrl), prefix).map((found) => ({
    // An own page has no ID: the key is built from the address (`key.ts`).
    externalId: null,
    title: found.title,
    url: found.url,
    location: null,
  }));
}

/**
 * Reads an own page by recipe. A page without a single vacancy by the recipe is
 * `unreadable`, not an empty list: otherwise a site redesign would "close" all
 * the company's vacancies (the author's decision of 20.11.2026). There is no
 * pagination: none of the 13 pages analysed had it in the HTML, and Load more
 * is loaded by JavaScript.
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
 * Links to pages of the same host, except the site menu and footer, anchors,
 * mail and the page itself. Relative addresses resolve against `<base href>` if
 * there is one, otherwise against the page address.
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

/** Vacancies of the `prefix` group in page order, each address once. */
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
 * A vacancy card is the largest ancestor of a link in which all links lead to
 * the same vacancy. In Framer it is the link itself, at delasport a block with an
 * `h3` and a "View & Apply" button, at ncube a block with a title and an empty link.
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
 * The vacancy title in a card, from the more reliable to the fallback: a heading;
 * an element with a title class (`vacancies__title` at ncube,
 * `career-item__position` at a-listware); the link's own text (headway: the title
 * is the link itself, and the department a longer line below it); the first line
 * of the card text (codebridge: the class `career-postiton` with a typo, the
 * title is the first line and the longer description below). Button text
 * ("View & Apply") is never a title. `null` means there is no text.
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

/** The line, if it can be a title - not empty and not button text. */
function meaningful(line: string): string | null {
  return line === "" || ACTION_TEXTS.has(line.toLowerCase()) ? null : line;
}

/** The first non-empty text among the elements, with whitespace collapsed. */
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

/** The separate lines of the card text - text nodes, without scripts and styles. */
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

/** The last part of the address as a title: `senior-react-developer` → "senior react developer". */
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
