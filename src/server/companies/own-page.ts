import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { isUuid } from "../../lib/uuid.ts";
import { careerSources, companies } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import { findLinkGroups, type LinkGroup } from "../parsers/own-page.ts";
import { fetchText } from "../parsers/shared.ts";

/**
 * The recipe for an own career page from the company card (task 6.21): the
 * Read as list button in an Unsupported page row. `previewOwnPage` fetches the
 * page and offers groups of links, `applyOwnPageRecipe` saves the chosen one.
 * Finding groups and reading by recipe: `src/server/parsers/own-page.ts`.
 */

/**
 * Pages that can be given a recipe: read by nothing, or already an own page -
 * then the recipe is replaced. A source read by a platform parser needs no
 * recipe.
 */
const RECIPE_PLATFORMS: CareerPlatform[] = ["unsupported", "own_page"];

/**
 * The recipe prefix: the host (with port) and a path ending in `/`. It comes
 * from the client, so its form is checked. The length is limited, like other
 * addresses.
 */
const PREFIX_PATTERN = /^[a-z0-9.-]+(:\d+)?\/(?:[^\s/]+\/)*$/;
const MAX_PREFIX_LENGTH = 2048;

export type OwnPagePreview =
  | { ok: true; groups: LinkGroup[] }
  /** The source does not exist, belongs to someone else or is already read by a platform parser. */
  | { ok: false; problem: "not-found" }
  /** The page could not be fetched: 404, another status or a failed request. */
  | { ok: false; problem: "page-unavailable" };

export async function previewOwnPage(
  db: NodePgDatabase,
  client: HttpClient,
  { userId, sourceId }: { userId: string; sourceId: string },
): Promise<OwnPagePreview> {
  const source = await findRecipeSource(db, { userId, sourceId });
  if (source === null) return { ok: false, problem: "not-found" };

  const page = await fetchText(client, source.url);
  if (!page.ok) return { ok: false, problem: "page-unavailable" };

  // Relative links resolve against the address after redirects - the same as
  // during a check (`readOwnPage`), so the prefixes match.
  return { ok: true, groups: findLinkGroups(page.body, page.url) };
}

/**
 * Saves the recipe: the page becomes an own page (`own_page`), is tracked, and
 * the "Link only" mark (6.17) is cleared - the page is read now.
 * `{ ok: false }` means the source does not exist, belongs to someone else, is
 * read by a platform parser, or the prefix has the wrong form.
 */
export async function applyOwnPageRecipe(
  db: NodePgDatabase,
  {
    userId,
    sourceId,
    prefix,
  }: { userId: string; sourceId: string; prefix: string },
): Promise<{ ok: boolean }> {
  if (prefix.length > MAX_PREFIX_LENGTH || !PREFIX_PATTERN.test(prefix)) {
    return { ok: false };
  }

  const source = await findRecipeSource(db, { userId, sourceId });
  if (source === null) return { ok: false };

  await db
    .update(careerSources)
    .set({
      platform: "own_page",
      vacancyLinkPrefix: prefix,
      isTracked: true,
      isReferenceOnly: false,
    })
    .where(eq(careerSources.id, source.id));

  return { ok: true };
}

/** The user's source that can be given a recipe, or `null`. */
async function findRecipeSource(
  db: NodePgDatabase,
  { userId, sourceId }: { userId: string; sourceId: string },
): Promise<{ id: string; url: string } | null> {
  if (!isUuid(sourceId)) return null;

  const [source] = await db
    .select({ id: careerSources.id, url: careerSources.url })
    .from(careerSources)
    .innerJoin(companies, eq(careerSources.companyId, companies.id))
    .where(
      and(
        eq(careerSources.id, sourceId),
        eq(companies.userId, userId),
        inArray(careerSources.platform, RECIPE_PLATFORMS),
      ),
    );

  return source ?? null;
}
