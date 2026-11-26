/**
 * Whether a request to an API route came from our own page. Next checks Server
 * Actions itself, but not plain routes (CLAUDE.md, "Security").
 *
 * `Sec-Fetch-Site` first: the browser sends a GET from the same page without
 * `Origin` (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin),
 * so checking `Origin` alone would reject our own polling. `same-site` is
 * rejected too: another program on another port of 127.0.0.1 is the same site,
 * but not our page
 * (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site).
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");

  if (site !== null) {
    // `none` - an address the user typed into the browser bar.
    return site === "same-origin" || site === "none";
  }

  const origin = headers.get("origin");

  // Not a browser (curl, a script): it cannot forge a request on behalf of the
  // user, and the server listens only on this machine.
  if (origin === null) return true;

  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    // `Origin: null` - a request from a sandbox or file://.
    return false;
  }
}
