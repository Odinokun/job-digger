import { detectPlatform, type CareerPlatform } from "./platform.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
  type UrlRefusalReason,
} from "./url.ts";

/** Що користувач увів у полі «додати карʼєрну сторінку». */
export type CareerSourceInput = {
  url: string;
  /** Підпис, яким користувач розрізняє джерела одного сайту. Необовʼязковий. */
  label?: string;
  /**
   * Адреси джерел, які компанія вже має, - так, як вони лежать у базі.
   * Дублікат шукається лише серед них: те саме джерело в іншої компанії
   * дублікатом не є (`src/server/db/README.md`).
   */
  existingUrls: string[];
};

/** Джерело, готове до вставки, - уже з платформою й відстеженням. */
export type PreparedCareerSource = {
  ok: true;
  /** Адреса в абсолютній формі: саме вона зберігається й стає посиланням. */
  url: string;
  label: string | null;
  platform: CareerPlatform;
  isTracked: boolean;
};

/**
 * Чому адресу не можна додати як джерело.
 *
 * `duplicate` не несе адреси: модалка показує те, що користувач щойно ввів, а
 * джерело-близнюк і так видно в списку вище.
 */
export type CareerSourceRefusal =
  | { ok: false; problem: "url"; reason: UrlRefusalReason }
  | { ok: false; problem: "duplicate" };

export type CareerSourceResult = PreparedCareerSource | CareerSourceRefusal;

/**
 * Готує карʼєрне джерело до вставки: чистить адресу, ловить дублікат усередині
 * компанії й виводить платформу.
 *
 * Чиста функція в `src/lib`, а не частина запиту: те саме потрібно і модалці
 * Edit, і пропозиції в Add company (картка 2.16), а правило дедуплікації має
 * жити в одному місці.
 *
 * **Дублікат - це збіг очищених адрес.** `https://www.mozilla.org/careers/` і
 * `mozilla.org/careers` - те саме джерело, а два посилання, що відрізняються
 * лише `query`, - різні: `normalizeCompanyUrl` зберігає `query` саме тому, що
 * ним розрізняють фільтри й національні версії сторінки.
 *
 * Унікальності в базі немає свідомо (`career_sources` без unique-індексу), тому
 * перевірка тут дружня, а не атомарна: двома одночасними Save дубльоване
 * джерело теоретично додасться, і прибирається воно кнопкою Remove. Ціна
 * помилки - рядок у списку, а не втрачені дані.
 */
export function prepareCareerSource({
  url,
  label,
  existingUrls,
}: CareerSourceInput): CareerSourceResult {
  const typed = url.trim();
  const normalized = normalizeCompanyUrl(typed);

  if (!normalized.ok) {
    return { ok: false, problem: "url", reason: normalized.reason };
  }

  const taken = existingUrls.some((existing) => {
    const normalizedExisting = normalizeCompanyUrl(existing);

    // Адреси з бази не перевіряємо повторно: непридатна там узятися не може, а
    // якщо взялася - вона просто не збігається ні з чим.
    return normalizedExisting.ok && normalizedExisting.url === normalized.url;
  });

  if (taken) {
    return { ok: false, problem: "duplicate" };
  }

  const platform = detectPlatform(normalized.url);
  const trimmedLabel = label?.trim() ?? "";

  return {
    ok: true,
    url: absoluteCompanyUrl(typed),
    // Порожній підпис - це «підпису немає», а не порожній рядок у базі.
    label: trimmedLabel === "" ? null : trimmedLabel,
    platform,
    // Сторінку, яку нічим прочитати, зберігаємо без відстеження
    // (docs/ui.md, розділ 4.3).
    isTracked: platform !== "unsupported",
  };
}
