import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { DISCOVERY_STATUSES } from "../../lib/companies/company-list.ts";
import { CAREER_PLATFORMS } from "../../lib/companies/platform.ts";
import {
  AUTO_CHECK_INTERVALS,
  DEFAULT_AUTO_CHECK_INTERVAL,
} from "../../lib/settings/auto-check-interval.ts";
import type { CheckTaskError } from "../queue/task-error.ts";

/**
 * Єдиний користувач локальної версії. Значення технічне: пошта нікуди не йде,
 * вхід через Google зʼявиться лише в онлайн-версії з allow-list у ENV.
 */
export const SYSTEM_USER_EMAIL = "system@job-digger.local";

/**
 * Власник даних. Компанії, джерела, вакансії й налаштування звʼязані з користувачем,
 * щоб дані були ізольовані навіть у локальній однокористувацькій версії
 * (docs/data.md, розділ 9).
 */
export const users = pgTable("users", {
  // uuid, а не послідовне число: після переїзду онлайн id не має бути вгадуваним.
  id: uuid("id").primaryKey().defaultRandom(),
  // Для майбутнього входу через Google. У локальній версії - технічне значення.
  email: text("email").notNull().unique(),
  // timestamptz, а не timestamp: зберігає момент часу, а не «настінний» час без зони.
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Стани компанії на вкладці Not tracked (docs/ui.md, розділ 4.3). Решта статусів
 * зі списку компаній тут не зберігається: Tracked - це «є хоч одне джерело, що
 * відстежується», а OK / Has errors / Checking рахуються з джерел і черги.
 *
 * Самий перелік - у [`lib/companies/company-list.ts`](../../lib/companies/company-list.ts),
 * бо тип статусу потрібен і в клієнтському списку компаній.
 */
export const discoveryStatus = pgEnum("discovery_status", DISCOVERY_STATUSES);

/**
 * Платформа карʼєрного джерела: за нею вибирається парсер. Самий перелік -
 * у [`lib/companies/platform.ts`](../../lib/companies/platform.ts), бо потрібен
 * і на клієнті.
 */
export const careerPlatform = pgEnum("career_platform", CAREER_PLATFORMS);

/**
 * Компанія, за вакансіями якої стежить користувач.
 */
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Головна адреса так, як її ввів користувач: зі шляхом, бо bosch.com/de і
    // bosch.com/ua - різні компанії (docs/discovery-and-parsing.md, розділ 5).
    //
    // Необовʼязкова: адреса ATS головного сайту не дає (`jobs.lever.co/spotify`),
    // і вигадувати його за користувача нема з чого - буває і `.io`, і `.ai`
    // (картка 2.17). Компанію тоді ідентифікує її карʼєрне джерело.
    url: text("url"),
    // Та сама адреса в очищеній формі - лише для порівняння дублікатів.
    // Саме очищення й повідомлення про збіг - задача 2.02.
    normalizedUrl: text("normalized_url"),
    discoveryStatus: discoveryStatus("discovery_status")
      .notNull()
      .default("not_checked"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Одна й та сама компанія в одного користувача - лише раз. У різних
    // користувачів однакові компанії дозволені: дані ізольовані.
    uniqueIndex("companies_user_normalized_url_unique").on(
      table.userId,
      table.normalizedUrl,
    ),
    // Список компаній завжди читається для одного користувача і сортується за
    // назвою. PostgreSQL не індексує зовнішній ключ автоматично.
    index("companies_user_name_idx").on(table.userId, table.name),
    // NOT NULL не ловить порожній рядок, а порожня назва дала б пустий рядок у списку.
    check("companies_name_not_blank", sql`length(trim(${table.name})) > 0`),
  ],
);

/**
 * Карʼєрне джерело компанії: одне джерело = одне завдання перевірки.
 * Одна компанія має багато джерел (docs/data.md, розділ 9).
 */
export const careerSources = pgTable(
  "career_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // Та сама адреса в очищеній формі. Потрібна, щоб запитом знаходити те саме
    // джерело в **іншої** компанії: нормалізація живе в TypeScript
    // (`normalizeCompanyUrl`), виразом в SQL її не записати, тож результат
    // доводиться зберігати. Для компанії без сайту це єдине, чим вона
    // відрізняється від такої самої (картка 2.17).
    normalizedUrl: text("normalized_url").notNull(),
    // Підпис, яким користувач розрізняє джерела одного сайту: три фільтри
    // mozilla.org відрізняються лише `query`, і сирий URL їх не розрізняє
    // (картка 2.16). Необовʼязковий: у джерела з власним доменом підписувати
    // нічого.
    label: text("label"),
    platform: careerPlatform("platform").notNull(),
    // Адреса, яку нічим прочитати, зберігається без відстеження: знадобиться,
    // якщо зʼявляться нові способи читання (docs/ui.md, розділ 4.3).
    isTracked: boolean("is_tracked").notNull().default(true),
    // Скільки перевірок підряд завершилися помилкою. Після збою вакансії не
    // видаляються, тому без лічильника застарілі дані не відрізнити від свіжих.
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    // Час останньої успішної перевірки: показ «Last ok: 12 days ago» - задача 4.09.
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    // Останнє успішне повне читання - усі сторінки до ліміту чи список, що
    // скінчився сам. Автоперевірка читає повністю не частіше ніж раз на добу,
    // решта - лише першу сторінку (задача 6.16). `null` - повністю ще не читали.
    lastFullReadAt: timestamp("last_full_read_at", { withTimezone: true }),
    // Час останньої перевірки, успішної чи ні: «Last checked: 5 min ago» у
    // картці компанії (docs/ui.md, розділ 4.2). `null` - ще не перевірялося.
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("career_sources_company_idx").on(table.companyId)],
);

/**
 * Вакансія кар'єрного джерела (docs/discovery-and-parsing.md, розділ 7).
 * Компанія й адреса джерела - через звʼязок «вакансія → джерело → компанія»,
 * окремо не зберігаються; опис, зарплата й тип зайнятості - теж.
 */
export const vacancies = pgTable(
  "vacancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Видалення джерела чи компанії забирає й вакансії, зокрема з Favorites:
    // те саме правило, що для Delete компанії (docs/ui.md, розділ 4.2).
    sourceId: uuid("source_id")
      .notNull()
      .references(() => careerSources.id, { onDelete: "cascade" }),
    // Внутрішній ключ у межах джерела: `id:<ID на платформі>` або, якщо ID
    // немає, `url:<очищена адреса>`. Рядок складає задача 3.05.
    key: text("key").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    // Необовʼязкова: якщо джерело її не дало, у списку стоїть «—».
    location: text("location"),
    // Дата виявлення: за нею сортується список Jobs. Це момент старту
    // перевірки, що знайшла вакансію (`checkedAt`), а не момент запису рядка.
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Момент запису рядка - годинник бази, а не перевірки. Межа для «Mark all
    // as read»: перевірка, що йде, поки відкритий діалог, пише вакансії з
    // ранішим `first_detected_at`, а `created_at` у них пізніший за межу
    // (src/server/vacancies/README.md, «Одночасні зміни»).
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Коли перевірка бачила вакансію востаннє («last checked» у плані).
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isRead: boolean("is_read").notNull().default(false),
    isFavorite: boolean("is_favorite").notNull().default(false),
    // Позначка Closed: вакансія з Favorites зникла з сайту. Момент, а не
    // так/ні, - щоб було видно, коли вона закрилась.
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    // Усередині одного джерела повторних записів не створюємо - це тримає база.
    // Між джерелами дублікати дозволені.
    uniqueIndex("vacancies_source_key_idx").on(table.sourceId, table.key),
    // Список Jobs: сортування й курсор за датою виявлення та id.
    index("vacancies_detected_idx").on(table.firstDetectedAt, table.id),
  ],
);

/**
 * Загальна перевірка (Check all чи автоперевірка) - один рядок History
 * (docs/ui.md, розділ 4.4). Check now і Retry сюди не пишуться.
 *
 * Лічильники зберігаються, а не рахуються з `check_tasks`: рядок History фіксує
 * результат на момент завершення, а завдання видаленого джерела зникають разом
 * із ним (docs/checks-and-queue.md, розділ 8).
 */
export const checkRuns = pgTable(
  "check_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Date & time у History і початок Duration.
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `null` - запуск ще йде.
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // Скільки джерел у запуску: знаменник прогресу «Checking 37/120».
    sourcesTotal: integer("sources_total").notNull().default(0),
    // Скільки джерел перевірено - разом із невдалими. Чисельник прогресу і
    // Sources checked у History.
    sourcesChecked: integer("sources_checked").notNull().default(0),
    sourcesFailed: integer("sources_failed").notNull().default(0),
    newVacancies: integer("new_vacancies").notNull().default(0),
    removedVacancies: integer("removed_vacancies").notNull().default(0),
    // Коли підсумок показали користувачу. Запуск часто завершується при
    // закритій вкладці, а підсумок має спливти один раз при поверненні (4.06).
    summaryShownAt: timestamp("summary_shown_at", { withTimezone: true }),
  },
  (table) => [
    // Одна загальна перевірка одночасно на користувача: два одночасні Check all
    // не проскочать навіть повз перевірку в коді.
    uniqueIndex("check_runs_one_active_per_user")
      .on(table.userId)
      .where(sql`${table.finishedAt} is null`),
    // History: запуски користувача від найновішого.
    index("check_runs_user_started_idx").on(table.userId, table.startedAt),
  ],
);

/**
 * Пріоритет завдання. Порядок значень і є порядком захоплення: ручні дії, на
 * результат яких дивиться користувач (Check now, Retry), беруться з черги
 * раніше за фонові (docs/checks-and-queue.md, розділ 8).
 */
export const checkTaskPriority = pgEnum("check_task_priority", [
  "manual",
  "background",
]);

/**
 * Що робить завдання: `check` - перевіряє одне карʼєрне джерело, `discover` -
 * шукає карʼєрні сторінки компанії на вкладці Not tracked (Find new pages,
 * задача 5.10). Одна черга на обидва: спільний ліміт одночасних завдань,
 * захоплення й повернення завислих працюють однаково.
 */
export const checkTaskKind = pgEnum("check_task_kind", ["check", "discover"]);

/**
 * Скільки читає завдання перевірки: лише першу сторінку чи до ліміту
 * (`src/server/parsers/vacancies-to-check.ts`, задача 6.16). Зберігається в
 * завданні, щоб Retry повторив саме те, що не вдалося.
 */
export const checkTaskReadDepth = pgEnum("check_task_read_depth", [
  "first-page",
  "full",
]);

export const checkTaskStatus = pgEnum("check_task_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

/**
 * Завдання черги: перевірка одного карʼєрного джерела. Одне джерело = одне
 * завдання (docs/overview.md, розділ 3).
 */
export const checkTasks = pgTable(
  "check_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: checkTaskKind("kind").notNull().default("check"),
    // Видалення джерела забирає його завдання: незавершені так і скасовуються,
    // а результат уже захопленого відкидає життєвий цикл (3.13). Лише в
    // `check`: у `discover` джерела ще немає.
    sourceId: uuid("source_id").references(() => careerSources.id, {
      onDelete: "cascade",
    }),
    // Компанія, для якої шукаються сторінки, - лише в `discover`. Видалена
    // компанія забирає й свій пошук.
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    // Загальна перевірка, що створила завдання. `null` - Check now чи Retry:
    // вони в History не пишуться.
    runId: uuid("run_id").references(() => checkRuns.id, {
      onDelete: "cascade",
    }),
    priority: checkTaskPriority("priority").notNull().default("background"),
    // У `discover` не використовується. Типово `full` - так читали всі
    // завдання до 6.16.
    readDepth: checkTaskReadDepth("read_depth").notNull().default("full"),
    status: checkTaskStatus("status").notNull().default("queued"),
    // Скільки разів завдання захоплювали: обмежує повтори після збою.
    attempts: integer("attempts").notNull().default(0),
    // Коли обробник захопив завдання. За ним завдання, що зависло в `running`,
    // повертається в чергу (4.02).
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    // Помилка парсера так, як він її повернув, або причина від самої черги
    // (`queue/task-error.ts`): її показує Failed Sources Drawer. Технічна
    // деталь - History її не показує.
    error: jsonb("error").$type<CheckTaskError>(),
    // Parse warning: скільки записів парсер пропустив через ваду даних
    // (docs/discovery-and-parsing.md, розділ 6).
    skippedVacancies: integer("skipped_vacancies").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Захоплення: черга за пріоритетом і віком. Частковий - бо в черзі завжди
    // жменя рядків, а завершених накопичуються тисячі.
    index("check_tasks_queue_idx")
      .on(table.priority, table.createdAt)
      .where(sql`${table.status} = 'queued'`),
    // Завершення запуску й прогрес рахуються по завданнях запуску.
    index("check_tasks_run_idx").on(table.runId),
    // Failed Sources Drawer і каскадне видалення джерела.
    index("check_tasks_source_idx").on(table.sourceId),
    // Каскадне видалення компанії і «чи триває Find new pages».
    index("check_tasks_company_idx").on(table.companyId),
    // Кожен вид завдання має рівно свою ціль: перевірка - джерело, пошук -
    // компанію. Інакше обробник отримав би завдання, яке нема чим виконати.
    check(
      "check_tasks_target_matches_kind",
      sql`(${table.kind} = 'check' and ${table.sourceId} is not null and ${table.companyId} is null) or (${table.kind} = 'discover' and ${table.companyId} is not null and ${table.sourceId} is null)`,
    ),
  ],
);

/**
 * Особисті налаштування користувача (docs/data.md, розділ 9; задача 6.01).
 *
 * Один рядок на користувача, і зʼявляється він лише з першим вибором: доки
 * його немає, діють значення за замовчуванням (`server/settings`). Тема й мова
 * сюди не входять - вони в cookie (`lib/theme.ts`, `i18n/config.ts`).
 */
export const settings = pgTable(
  "settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // Інтервал автоперевірки в годинах - число, а не enum: з ним рахується час
    // наступної перевірки (6.02).
    autoCheckIntervalHours: integer("auto_check_interval_hours")
      .notNull()
      .default(DEFAULT_AUTO_CHECK_INTERVAL),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Перелік той самий, що показує Settings: інше значення база не прийме,
    // навіть якщо запис піде поза нашим кодом.
    check(
      "settings_auto_check_interval_allowed",
      sql`${table.autoCheckIntervalHours} in (${sql.raw(AUTO_CHECK_INTERVALS.join(", "))})`,
    ),
  ],
);
