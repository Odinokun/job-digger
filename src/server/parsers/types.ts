/**
 * Спільний формат усіх парсерів: що вони повертають.
 *
 * Парсер лише читає, що є на платформі зараз. Дату виявлення, Read/Unread,
 * ключ вакансії й очищення URL робить життєвий цикл (задачі 3.13 і 3.05).
 */
import type { HttpErrorReason } from "../http/client.ts";

/** Вакансія так, як її дало джерело. */
export interface ParsedVacancy {
  /** ID на платформі - з нього складається ключ вакансії. */
  externalId: string;
  title: string;
  /** Посилання на оригінал; завжди http або https. */
  url: string;
  /** Локації може не бути - тоді в списку Jobs стоїть «—». */
  location: string | null;
}

export type ParserError =
  /** Сторінки чи дошки немає: сайт відповів 404. */
  | { reason: "not-found" }
  /** Відповідь не того формату - зокрема хоч одна вакансія в ній крива. */
  | { reason: "unreadable" }
  /** Запит не вдався: причина - з `HttpError`. */
  | { reason: "fetch-failed"; cause: HttpErrorReason };

export type ParseResult =
  { ok: true; vacancies: ParsedVacancy[] } | { ok: false; error: ParserError };
