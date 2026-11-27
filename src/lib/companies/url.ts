/** Why the address cannot be used. */
export type UrlRefusalReason = "empty" | "not-a-url" | "unsupported-scheme";

/**
 * The normalized form of a company address - the one addresses are compared by -
 * or the reason the address cannot be used at all.
 */
export type NormalizedCompanyUrl =
  { ok: true; url: string } | { ok: false; reason: UrlRefusalReason };

/** We fetch only these schemes (CLAUDE.md, "Security"). */
const SUPPORTED_SCHEMES = ["http:", "https:"];

/** A protocol at the start of the string: `https:`, `ftp:` and any other. */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Brings a company address to a comparable form: no protocol, no `www.`, no
 * trailing slash, the domain in lower case. The path is kept together with its
 * case, because bosch.com/de and bosch.com/ua are different companies.
 */
export function normalizeCompanyUrl(input: string): NormalizedCompanyUrl {
  const trimmed = input.trim();

  if (trimmed === "") {
    return { ok: false, reason: "empty" };
  }

  let parsed;
  try {
    // The user may paste an address without a protocol - then we add https,
    // because otherwise `new URL` cannot parse the string at all.
    parsed = new URL(absoluteCompanyUrl(trimmed));
  } catch {
    return { ok: false, reason: "not-a-url" };
  }

  if (!SUPPORTED_SCHEMES.includes(parsed.protocol)) {
    return { ok: false, reason: "unsupported-scheme" };
  }

  // URL itself lowercases the host and converts it to punycode.
  const host = parsed.host.replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");

  // The fragment is dropped - it stays in the browser and never reaches the server.
  // The query stays: it sometimes tells national versions of a site apart.
  return { ok: true, url: `${host}${path}${parsed.search}` };
}

/**
 * The address in absolute form: if there is no protocol, `https://` is added.
 *
 * Needed because the entered address cannot be stored as it is - without a protocol
 * the `<a href>` in the company list would become a relative link leading nowhere.
 * The rest of the address does not change: the path, case and query stay as the user
 * entered them (`normalizeCompanyUrl` gives another, comparable form).
 *
 * The function checks nothing - `normalizeCompanyUrl` establishes whether the address
 * is usable, and this one should be called only after its `ok`.
 */
export function absoluteCompanyUrl(input: string): string {
  const trimmed = input.trim();

  return SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * The host of a normalized address - what comes before the first slash or question
 * mark.
 *
 * Accepts the result of `normalizeCompanyUrl`, so there is no need to parse the
 * string with `URL` here: there is no protocol, and the host is already in lower case.
 */
export function companyUrlHost(normalizedUrl: string): string {
  return normalizedUrl.split("/")[0].split("?")[0];
}
