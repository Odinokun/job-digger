/**
 * The vacancy key within a source (src/server/vacancies/README.md): the ID on the
 * platform, and if there is none, the cleaned address.
 */

/**
 * Tracking parameters: they say where the visitor came from, not which vacancy
 * this is. `utm_*` and `gh_src` are obvious; `gh_jid` duplicates the ID from the
 * Greenhouse path (`.../jobs/5426468004?gh_jid=5426468004`), `fbclid` and `gclid`
 * are Facebook and Google ad tags. Other parameters stay: `?id=42` tells vacancies
 * apart.
 */
const TRACKING_PARAMS = new Set(["gh_src", "gh_jid", "fbclid", "gclid"]);

function isTrackingParam(name: string): boolean {
  return name.startsWith("utm_") || TRACKING_PARAMS.has(name);
}

/**
 * The vacancy address in a form fit for comparison: without tracking parameters,
 * without the anchor and the trailing slash of the path, with the host in lower
 * case (`URL` does that itself) and the parameters in one order. The case of the
 * path stays - on many sites it matters.
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

/**
 * The vacancy key within a source: `id:<ID on the platform>`, and without an ID
 * `url:<cleaned address>`. With an ID the address does not affect the key: it may
 * change while the vacancy stays the same (src/server/vacancies/README.md).
 *
 * It takes only two fields, not the parser type: a schema.org parser (3.11) may
 * have no ID.
 */
export function vacancyKey({
  externalId,
  url,
}: {
  externalId: string | null;
  url: string;
}): string {
  const id = externalId?.trim();

  return id ? `id:${id}` : `url:${cleanVacancyUrl(url)}`;
}
