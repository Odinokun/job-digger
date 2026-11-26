/**
 * The platform of a career page by its content - for addresses whose host gives
 * nothing to read them with (task 5.13).
 */
import {
  detectPlatform,
  type CareerPlatform,
} from "../../lib/companies/platform.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
} from "../../lib/companies/url.ts";
import type { HttpClient } from "../http/client.ts";
import { isPeopleForcePage } from "../parsers/peopleforce.ts";
import { fetchText } from "../parsers/shared.ts";

/**
 * Page platforms recognised by content: normalized address → platform. For now
 * this is only PeopleForce on the company's domain
 * (`peopleforce.softconstruct.com`); other ATS come when a real source turns up.
 *
 * Only what is `unsupported` by host is fetched: a known ATS address has already
 * named its platform, and a broken address is not fetched at all. A page that
 * did not answer or has no PeopleForce markup does not get into the result - the
 * source stays `unsupported`, as it would without this check.
 *
 * Called before the transaction: a request to someone else's site may last until
 * the timeout, and there is no reason to hold a database connection all that time.
 */
export async function platformsByPage(
  urls: string[],
  client: HttpClient,
): Promise<Map<string, CareerPlatform>> {
  const found = new Map<string, CareerPlatform>();

  await Promise.all(
    urls.map(async (typed) => {
      const normalized = normalizeCompanyUrl(typed);

      if (!normalized.ok || detectPlatform(normalized.url) !== "unsupported") {
        return;
      }

      const page = await fetchText(client, absoluteCompanyUrl(typed));

      if (page.ok && isPeopleForcePage(page.body)) {
        found.set(normalized.url, "peopleforce");
      }
    }),
  );

  return found;
}

/**
 * The platforms `platformsByPage` recognised by content: normalized address →
 * platform. The functions that add sources take it into account only for
 * addresses that are `unsupported` by host - it does not override a known ATS.
 */
export type PagePlatforms = ReadonlyMap<string, CareerPlatform>;

/**
 * A source with the platform recognised by page content, if the address did not
 * name one itself. Such a source can be read, so it is tracked.
 */
export function withPagePlatform<
  T extends {
    normalizedUrl: string;
    platform: CareerPlatform;
    isTracked: boolean;
  },
>(source: T, pagePlatforms: PagePlatforms | undefined): T {
  const platform =
    source.platform === "unsupported"
      ? pagePlatforms?.get(source.normalizedUrl)
      : undefined;

  return platform === undefined || platform === "unsupported"
    ? source
    : { ...source, platform, isTracked: true };
}
