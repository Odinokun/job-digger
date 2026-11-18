/**
 * Ключ вакансії в межах джерела (docs/discovery-and-parsing.md, розділ 7):
 * ID на платформі, а якщо його немає - очищена адреса.
 */

/**
 * Мітки відстеження: кажуть, звідки прийшов відвідувач, а не яка це вакансія.
 * План називає `utm_*` і `gh_src`; `gh_jid` дублює ID зі шляху Greenhouse
 * (`.../jobs/5426468004?gh_jid=5426468004`), `fbclid` і `gclid` - рекламні
 * мітки Facebook і Google. Решта параметрів лишається: `?id=42` розрізняє
 * вакансії.
 */
const TRACKING_PARAMS = new Set(["gh_src", "gh_jid", "fbclid", "gclid"]);

function isTrackingParam(name: string): boolean {
  return name.startsWith("utm_") || TRACKING_PARAMS.has(name);
}

/**
 * Адреса вакансії у формі, яку можна порівнювати: без міток відстеження, без
 * якоря й слеша в кінці шляху, з хостом у нижньому регістрі (`URL` робить це
 * сам) і параметрами в одному порядку. Регістр шляху лишається - на багатьох
 * сайтах він важить.
 */
export function cleanVacancyUrl(input: string): string {
  const url = new URL(input);

  const params = [...url.searchParams]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(params).toString();

  const path = url.pathname.replace(/\/+$/, "");

  return `${url.origin}${path}${query === "" ? "" : `?${query}`}`;
}
