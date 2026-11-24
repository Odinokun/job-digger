/**
 * Життєвий цикл вакансії: що одна перевірка джерела робить із його вакансіями в
 * базі. Правила й рішення - README.md поруч, розділ «Життєвий цикл».
 */
import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CareerPlatform } from "../../lib/companies/platform.ts";
import { careerSources, companies, vacancies } from "../db/schema.ts";
import type { ParsedVacancy, ParseResult } from "../parsers/types.ts";
import { resolveDuplicates, sourceKind } from "./duplicates.ts";
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

/**
 * Що перевірка зробила з вакансіями джерела - числа рядка History. Видалені -
 * усі, що зникли з сайту: і стерті, і Favorites, які отримали Closed.
 */
export interface SyncCounts {
  newVacancies: number;
  removedVacancies: number;
}

const NOTHING: SyncCounts = { newVacancies: 0, removedVacancies: 0 };

export async function syncSourceVacancies(
  db: NodePgDatabase,
  { sourceId, result, checkedAt }: SyncSourceVacanciesInput,
): Promise<SyncCounts> {
  if (!result.ok) return NOTHING;

  return db.transaction(async (tx) => {
    // Джерело могли видалити, поки сайт відповідав, - тоді результат
    // відкидається (README.md поруч). `FOR KEY SHARE` ще й
    // не дає видалити джерело до кінця транзакції: видалення дочекається, і
    // каскад прибере щойно записані вакансії разом зі старими
    // (https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
    const [source] = await tx
      .select({
        id: careerSources.id,
        companyId: careerSources.companyId,
        platform: careerSources.platform,
      })
      .from(careerSources)
      .where(eq(careerSources.id, sourceId))
      .for("key share");
    if (source === undefined) return NOTHING;

    // Джерела однієї компанії перевіряються паралельно, а дублікат шукається
    // серед вакансій інших її джерел (задача 6.20). Без черги два джерела
    // одночасно не побачили б одне одного й обидва записали б вакансію
    // непрочитаною. `FOR NO KEY UPDATE` конфліктує сам із собою, тож записи
    // однієї компанії йдуть по черзі, але не з `FOR KEY SHARE`, яким вставки
    // джерел перевіряють зовнішній ключ, - додавання джерела не чекає
    // (https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).
    await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, source.companyId))
      .for("no key update");

    const newIds = await upsertSeen(tx, sourceId, result.vacancies, checkedAt);
    const duplicates = await markDuplicates(tx, {
      sourceId,
      companyId: source.companyId,
      platform: source.platform,
      newIds,
    });

    return {
      // Дублікат записано прочитаним - для людини він не новий.
      newVacancies: newIds.length - duplicates,
      // Обірваний список (ліміт чи перша сторінка) не каже, що решта
      // зникла: її просто не читали (задача 6.16).
      removedVacancies: result.truncated
        ? 0
        : await removeGone(tx, sourceId, checkedAt),
    };
  });
}

type Executor = Pick<NodePgDatabase, "insert" | "execute">;

/**
 * Знайдені вакансії: нові створюються, наявні отримують свіжі дані з сайту.
 * Повертає id нових вакансій.
 */
async function upsertSeen(
  db: Executor,
  sourceId: string,
  list: ParsedVacancy[],
  checkedAt: Date,
): Promise<string[]> {
  // Порожній `values([])` Drizzle не приймає, а вставляти й нічого.
  if (list.length === 0) return [];

  const rows = await db
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
    })
    .returning({
      id: vacancies.id,
      firstDetectedAt: vacancies.firstDetectedAt,
    });

  // Нова - та, що виявлена саме цією перевіркою: оновлення наявної дату
  // виявлення не чіпає.
  return rows
    .filter((row) => row.firstDetectedAt.getTime() === checkedAt.getTime())
    .map((row) => row.id);
}

/**
 * Назва для порівняння дублікатів: нижній регістр, пробіли на краях
 * обрізані, всередині стиснуті до одного (рішення автора 20.11.2026).
 * `lower` у PostgreSQL знає й кирилицю: база створена з `en_US.utf8`
 * (https://www.postgresql.org/docs/current/functions-string.html).
 */
function comparableTitle(column: string) {
  return sql.raw(`lower(btrim(regexp_replace(${column}, '\\s+', ' ', 'g')))`);
}

/**
 * Дублікати щойно виявлених вакансій серед активних вакансій інших джерел
 * тієї самої компанії (задача 6.20). Хто стає прочитаним, вирішує
 * `resolveDuplicates`; повертає, скільки нових вакансій прочитано.
 *
 * Лише щойно виявлені: вакансію, яку людина сама повернула в Unread,
 * наступна перевірка не чіпає. Закрита вакансія з Favorites дублікатом не
 * вважається - на сайті її вже немає.
 */
async function markDuplicates(
  db: Executor,
  {
    sourceId,
    companyId,
    platform,
    newIds,
  }: {
    sourceId: string;
    companyId: string;
    platform: CareerPlatform;
    newIds: string[];
  },
): Promise<number> {
  if (newIds.length === 0) return 0;

  const ids = sql.join(
    newIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const { rows } = await db.execute<{
    newId: string;
    otherId: string;
    otherPlatform: CareerPlatform;
    otherIsRead: boolean;
  }>(sql`
    select found.id as "newId",
           other.id as "otherId",
           other_source.platform as "otherPlatform",
           other.is_read as "otherIsRead"
    from ${vacancies} as found
    join ${vacancies} as other
      on other.source_id <> found.source_id
     and other.closed_at is null
     and ${comparableTitle("other.title")} = ${comparableTitle("found.title")}
    join ${careerSources} as other_source
      on other_source.id = other.source_id
     and other_source.company_id = ${companyId}
    where found.source_id = ${sourceId} and found.id in (${ids})
  `);

  const decision = resolveDuplicates(
    sourceKind(platform),
    rows.map((row) => ({
      newId: row.newId,
      otherId: row.otherId,
      otherKind: sourceKind(row.otherPlatform),
      otherIsRead: row.otherIsRead,
    })),
  );

  const toRead = [...decision.readNew, ...decision.readOthers];
  if (toRead.length > 0) {
    await db.execute(sql`
      update ${vacancies} set is_read = true
      where id in (${sql.join(
        toRead.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    `);
  }

  return decision.readNew.length;
}

/**
 * Вакансії з різними ключами, з кожного ключа - перша. Повторів усередині
 * джерела не створюємо, а `ON CONFLICT DO UPDATE` і не дає двічі
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
): Promise<number> {
  const gone = sql`${vacancies.sourceId} = ${sourceId} and ${vacancies.lastSeenAt} < ${checkedAt}`;

  const result = await db.execute<{ removed: number }>(sql`
    with deleted as (
      delete from ${vacancies}
      where ${gone} and not ${vacancies.isFavorite}
      -- Закриту, прибрану з Favorites, видаляємо, але вдруге не рахуємо:
      -- зниклою вона вже порахована, коли закрилась.
      returning ${vacancies.closedAt} is null as counted
    ),
    closed as (
      update ${vacancies}
      set ${sql.identifier(vacancies.closedAt.name)} = ${checkedAt}
      where ${gone} and ${vacancies.isFavorite} and ${vacancies.closedAt} is null
      returning 1
    )
    select ((select count(*) from deleted where counted) + (select count(*) from closed))::int as removed
  `);

  return result.rows[0].removed;
}
