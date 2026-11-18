/**
 * Життєвий цикл вакансії: що одна перевірка джерела робить із його вакансіями в
 * базі. Правила й рішення - README.md поруч, розділ «Життєвий цикл».
 */
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { careerSources, vacancies } from "../db/schema.ts";
import type { ParsedVacancy, ParseResult } from "../parsers/types.ts";
import { vacancyKey } from "./key.ts";

export interface SyncSourceVacanciesInput {
  sourceId: string;
  /** Відповідь парсера для цього джерела. */
  result: ParseResult;
  /**
   * Момент перевірки. Передається ззовні, а не береться з годинника тут: його
   * задає черга, а тест може порівнювати дати на рівність.
   */
  checkedAt: Date;
}

export async function syncSourceVacancies(
  db: NodePgDatabase,
  { sourceId, result, checkedAt }: SyncSourceVacanciesInput,
): Promise<void> {
  if (!result.ok) return;

  await db.transaction(async (tx) => {
    // Джерело могли видалити, поки сайт відповідав, - тоді результат
    // відкидається (docs/checks-and-queue.md, розділ 8). `FOR KEY SHARE` ще й
    // не дає видалити джерело до кінця транзакції: видалення дочекається, і
    // каскад прибере щойно записані вакансії разом зі старими
    // (https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
    const [source] = await tx
      .select({ id: careerSources.id })
      .from(careerSources)
      .where(eq(careerSources.id, sourceId))
      .for("key share");
    if (source === undefined) return;

    await upsertSeen(tx, sourceId, result.vacancies, checkedAt);
    await removeGone(tx, sourceId, checkedAt);
  });
}

type Executor = Pick<NodePgDatabase, "insert" | "execute">;

/** Знайдені вакансії: нові створюються, наявні отримують свіжі дані з сайту. */
async function upsertSeen(
  db: Executor,
  sourceId: string,
  list: ParsedVacancy[],
  checkedAt: Date,
): Promise<void> {
  // Порожній `values([])` Drizzle не приймає, а вставляти й нічого.
  if (list.length === 0) return;

  await db
    .insert(vacancies)
    .values(
      uniqueByKey(list).map(([key, vacancy]) => ({
        sourceId,
        key,
        title: vacancy.title,
        url: vacancy.url,
        location: vacancy.location,
        firstDetectedAt: checkedAt,
        lastSeenAt: checkedAt,
      })),
    )
    // Вакансія вже є - оновлюються лише поля перевірки. Read і Favorite належать
    // користувачеві й сюди не потрапляють (README, «Одночасні зміни»).
    .onConflictDoUpdate({
      target: [vacancies.sourceId, vacancies.key],
      set: {
        // `excluded` - рядок, який ми намагалися вставити
        // (https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).
        // Нова адреса тут можлива лише для ключа з ID: без ID інша адреса дає
        // інший ключ, тобто іншу вакансію (`key.ts`).
        title: sql.raw(`excluded.${vacancies.title.name}`),
        url: sql.raw(`excluded.${vacancies.url.name}`),
        location: sql.raw(`excluded.${vacancies.location.name}`),
        lastSeenAt: checkedAt,
        // Закрита вакансія з Favorites повернулася на сайт - позначка Closed
        // знімається, а Read, Favorite і дата виявлення лишаються: користувач її
        // уже бачив і зберіг. «Повернулася - нова Unread» з плану стосується
        // видалених вакансій, і для них це виходить само - рядок створюється
        // заново.
        closedAt: null,
      },
    });
}

/**
 * Вакансії з різними ключами, з кожного ключа - перша. Повторів усередині
 * джерела не створюємо (розділ 7), а `ON CONFLICT DO UPDATE` і не дає двічі
 * змінити один рядок однією командою - падає з cardinality violation
 * (https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT).
 */
function uniqueByKey(list: ParsedVacancy[]): [string, ParsedVacancy][] {
  const byKey = new Map<string, ParsedVacancy>();

  for (const vacancy of list) {
    const key = vacancyKey(vacancy);
    if (!byKey.has(key)) byKey.set(key, vacancy);
  }

  return [...byKey];
}

/**
 * Зниклі вакансії - ті, яких ця перевірка не бачила: після `upsertSeen` у них
 * `last_seen_at` раніше за `checkedAt`. Звичайні видаляються, з Favorites -
 * отримують позначку Closed.
 *
 * Одна команда, а не «прочитати, а тоді видалити» (README, «Одночасні
 * зміни»): умова `NOT is_favorite` перевіряється в момент видалення. Якщо
 * користувач саме додає вакансію у Favorites, PostgreSQL чекає на його
 * транзакцію і перевіряє умову на оновленому рядку, тож вакансія не губиться
 * (https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED).
 *
 * Обидві частини команди бачать один знімок бази
 * (https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-MODIFYING),
 * тож така вакансія в цю перевірку ще й не отримає Closed - лише в наступну.
 * Головне - вона лишається.
 */
async function removeGone(
  db: Executor,
  sourceId: string,
  checkedAt: Date,
): Promise<void> {
  const gone = sql`${vacancies.sourceId} = ${sourceId} and ${vacancies.lastSeenAt} < ${checkedAt}`;

  await db.execute(sql`
    with deleted as (
      delete from ${vacancies}
      where ${gone} and not ${vacancies.isFavorite}
    )
    update ${vacancies}
    set ${sql.identifier(vacancies.closedAt.name)} = ${checkedAt}
    where ${gone} and ${vacancies.isFavorite} and ${vacancies.closedAt} is null
  `);
}
