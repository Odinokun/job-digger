/**
 * Спільний формат усіх парсерів: що вони повертають.
 *
 * Парсер лише читає, що є на платформі зараз. Дату виявлення, Read/Unread,
 * ключ вакансії й очищення URL робить життєвий цикл (задачі 3.13 і 3.05).
 */
import type { HttpErrorReason } from "../http/client.ts";

/** Вакансія так, як її дало джерело. */
export interface ParsedVacancy {
  /**
   * ID на платформі - з нього складається ключ вакансії. `null`, якщо платформа
   * його не дає (schema.org, задача 3.11): тоді ключ складається з адреси.
   */
  externalId: string | null;
  title: string;
  /** Посилання на оригінал; завжди http або https. */
  url: string;
  /** Локації може не бути - тоді в списку Jobs стоїть «—». */
  location: string | null;
}

export type ParserError =
  /** Сторінки чи дошки немає: сайт відповів 404. */
  | { reason: "not-found" }
  /**
   * Відповідь не того формату: зламана структура хоч одного запису або всі
   * записи з вадою даних (README, «Спільний формат»).
   */
  | { reason: "unreadable" }
  /** Сайт відповів не 2xx і не 404 (наприклад 403 чи 500 після повторів). */
  | { reason: "bad-status"; status: number }
  /** Запит не вдався: причина - з `HttpError`. */
  | { reason: "fetch-failed"; cause: HttpErrorReason };

export type ParseResult =
  | {
      ok: true;
      vacancies: ParsedVacancy[];
      /**
       * Скільки записів пропущено через ваду даних - порожню назву чи адресу
       * не http(s) (docs/discovery-and-parsing.md, розділ 6). Сигнал «парсер
       * чи сайт треба глянути» - parse warning у деталях завдання (4.01).
       */
      skipped: number;
      /**
       * `true` - читання зупинилось на ліміті (`vacancies-to-check.ts`), і за
       * ним можуть бути ще вакансії. Тоді список неповний, і життєвий цикл
       * нічого не позначає зниклим (задача 6.16). Немає поля - список повний:
       * так завжди в парсерів, що беруть усе одним запитом.
       */
      truncated?: true;
    }
  | { ok: false; error: ParserError };
