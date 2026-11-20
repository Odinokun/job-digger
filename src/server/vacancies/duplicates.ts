/**
 * Дублікати вакансій між джерелами однієї компанії (задача 6.20): та сама
 * вакансія на ATS, на агрегаторі й на сайті компанії. Дублікат не відкидається,
 * а зберігається прочитаним - його немає в Unread, лічильнику й «N new
 * vacancies». Правила й рішення - README.md поруч, розділ «Дублікати між
 * джерелами».
 *
 * Тут - чиста частина: який із дублікатів стає прочитаним. Пошук збігів і
 * запис - `lifecycle.ts`.
 */
import type { CareerPlatform } from "../../lib/companies/platform.ts";

/**
 * Платформа - ATS чи агрегатор (PeopleForce, DOU…), сайт - власна сторінка
 * компанії. Платформи мають перевагу: вони «гнучкіші й живіші» в показі
 * (рішення автора 20.11.2026).
 */
export type SourceKind = "platform" | "site";

/**
 * Платформи, які читають власний сайт компанії, а не ATS: schema.org
 * `JobPosting` (задача 3.11) і сторінка за рецептом (задача 6.21).
 */
const SITE_PLATFORMS: ReadonlySet<CareerPlatform> = new Set([
  "schema_org",
  "own_page",
]);

export function sourceKind(platform: CareerPlatform): SourceKind {
  return SITE_PLATFORMS.has(platform) ? "site" : "platform";
}

/**
 * Збіг: щойно виявлена вакансія `newId` має ту саму назву, що й активна
 * вакансія `otherId` з іншого джерела тієї самої компанії.
 */
export interface DuplicateMatch {
  newId: string;
  otherId: string;
  otherKind: SourceKind;
  otherIsRead: boolean;
}

/** Що позначити прочитаним: нові вакансії і наявні, які поступаються новим. */
export interface DuplicateDecision {
  readNew: string[];
  readOthers: string[];
}

/**
 * Пізніший дублікат стає прочитаним. Виняток - перевага платформи: нова
 * вакансія з платформи, чиї дублікати лише на сайті й хоч один непрочитаний,
 * лишається непрочитаною, а непрочитані сайтові стають прочитаними. Якщо
 * сайтові всі вже прочитані, людина вакансію бачила - нова теж прочитана.
 *
 * `kind` - вид джерела, з якого прийшли нові вакансії.
 */
export function resolveDuplicates(
  kind: SourceKind,
  matches: DuplicateMatch[],
): DuplicateDecision {
  const byNew = new Map<string, DuplicateMatch[]>();
  for (const found of matches) {
    byNew.set(found.newId, [...(byNew.get(found.newId) ?? []), found]);
  }

  const decision: DuplicateDecision = { readNew: [], readOthers: [] };

  for (const [newId, others] of byNew) {
    const unreadSites = others.filter(
      (other) => other.otherKind === "site" && !other.otherIsRead,
    );
    const winsOverSite =
      kind === "platform" &&
      others.every((other) => other.otherKind === "site") &&
      unreadSites.length > 0;

    if (winsOverSite) {
      decision.readOthers.push(...unreadSites.map((other) => other.otherId));
    } else {
      decision.readNew.push(newId);
    }
  }

  return decision;
}
