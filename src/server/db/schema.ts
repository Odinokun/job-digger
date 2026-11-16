import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { DISCOVERY_STATUSES } from "../../lib/companies/company-list.ts";
import { CAREER_PLATFORMS } from "../../lib/companies/platform.ts";

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
    url: text("url").notNull(),
    // Та сама адреса в очищеній формі - лише для порівняння дублікатів.
    // Саме очищення й повідомлення про збіг - задача 2.02.
    normalizedUrl: text("normalized_url").notNull(),
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
    platform: careerPlatform("platform").notNull(),
    // Адреса, яку нічим прочитати, зберігається без відстеження: знадобиться,
    // якщо зʼявляться нові способи читання (docs/ui.md, розділ 4.3).
    isTracked: boolean("is_tracked").notNull().default(true),
    // Скільки перевірок підряд завершилися помилкою. Після збою вакансії не
    // видаляються, тому без лічильника застарілі дані не відрізнити від свіжих.
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    // Час останньої успішної перевірки: показ «Last ok: 12 days ago» - задача 4.09.
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("career_sources_company_idx").on(table.companyId)],
);
