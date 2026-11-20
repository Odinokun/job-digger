import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { isUuid } from "../../lib/uuid.ts";
import { careerSources, companies } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import { findLinkGroups, type LinkGroup } from "../parsers/own-page.ts";
import { fetchText } from "../parsers/shared.ts";

/**
 * Рецепт власної кар'єрної сторінки з картки компанії (задача 6.21): кнопка
 * Read as list у рядку сторінки Unsupported. `previewOwnPage` завантажує
 * сторінку й пропонує групи посилань, `applyOwnPageRecipe` записує вибрану.
 * Пошук груп і читання за рецептом - `src/server/parsers/own-page.ts`.
 */

/**
 * Сторінки, яким можна дати рецепт: не прочитана нічим, або вже власна - тоді
 * рецепт замінюється. Джерело, яке читає парсер платформи, рецепта не
 * потребує.
 */
const RECIPE_PLATFORMS: CareerPlatform[] = ["unsupported", "own_page"];

/**
 * Префікс рецепта: хост (з портом) і шлях, що закінчується `/`. Приходить із
 * клієнта, тож перевіряється формою. Довжина обмежена, як і решта адрес.
 */
const PREFIX_PATTERN = /^[a-z0-9.-]+(:\d+)?\/(?:[^\s/]+\/)*$/;
const MAX_PREFIX_LENGTH = 2048;

export type OwnPagePreview =
  | { ok: true; groups: LinkGroup[] }
  /** Джерела немає, воно чуже або вже читається парсером платформи. */
  | { ok: false; problem: "not-found" }
  /** Сторінку не вдалося завантажити: 404, інший статус чи збій запиту. */
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

  // Від адреси після редиректів розв'язуються відносні посилання - так само,
  // як під час перевірки (`readOwnPage`), тож префікси збігаються.
  return { ok: true, groups: findLinkGroups(page.body, page.url) };
}

/**
 * Записує рецепт: сторінка стає власною (`own_page`), відстежується, а
 * позначка «Link only» (6.17) знімається - сторінку тепер читаємо.
 * `{ ok: false }` - джерела немає, воно чуже, читається парсером платформи або
 * префікс не тієї форми.
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

/** Джерело користувача, якому можна дати рецепт, або `null`. */
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
