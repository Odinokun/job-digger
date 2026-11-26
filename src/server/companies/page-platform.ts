/**
 * Платформа кар'єрної сторінки за її вмістом - для адрес, які за хостом нічим
 * не прочитати (задача 5.13).
 */
import {
  detectPlatform,
  type CareerPlatform,
} from "../../lib/companies/platform.ts";
import {
  absoluteCompanyUrl,
  normalizeCompanyUrl,
} from "../../lib/companies/url.ts";
import type { HttpClient } from "../http/client.ts";
import { isPeopleForcePage } from "../parsers/peopleforce.ts";
import { fetchText } from "../parsers/shared.ts";

/**
 * Платформи сторінок, які вдалося впізнати за вмістом: очищена адреса →
 * платформа. Поки це лише PeopleForce на домені компанії
 * (`peopleforce.softconstruct.com`), інші ATS - коли трапиться справжнє джерело.
 *
 * Завантажується лише те, що за хостом `unsupported`: адреса відомої ATS
 * платформу вже назвала, а крива адреса не завантажується взагалі. Сторінка, що
 * не відповіла чи не в розмітці PeopleForce, у результат не потрапляє -
 * джерело лишиться `unsupported`, як і без цієї перевірки.
 *
 * Викликається до транзакції: запит до чужого сайту може тривати до тайм-ауту,
 * і тримати весь цей час з'єднання з базою нема чого.
 */
export async function platformsByPage(
  urls: string[],
  client: HttpClient,
): Promise<Map<string, CareerPlatform>> {
  const found = new Map<string, CareerPlatform>();

  await Promise.all(
    urls.map(async (typed) => {
      const normalized = normalizeCompanyUrl(typed);

      if (!normalized.ok || detectPlatform(normalized.url) !== "unsupported") {
        return;
      }

      const page = await fetchText(client, absoluteCompanyUrl(typed));

      if (page.ok && isPeopleForcePage(page.body)) {
        found.set(normalized.url, "peopleforce");
      }
    }),
  );

  return found;
}

/**
 * Платформи, які `platformsByPage` упізнала за вмістом: очищена адреса →
 * платформа. Функції додавання джерел беруть її до уваги лише для адрес, що за
 * хостом `unsupported`, - відому ATS вона не перепише.
 */
export type PagePlatforms = ReadonlyMap<string, CareerPlatform>;

/**
 * Джерело з платформою, впізнаною за вмістом сторінки, якщо адреса сама її не
 * назвала. Таке джерело читається, тож і відстежується.
 */
export function withPagePlatform<
  T extends {
    normalizedUrl: string;
    platform: CareerPlatform;
    isTracked: boolean;
  },
>(source: T, pagePlatforms: PagePlatforms | undefined): T {
  const platform =
    source.platform === "unsupported"
      ? pagePlatforms?.get(source.normalizedUrl)
      : undefined;

  return platform === undefined || platform === "unsupported"
    ? source
    : { ...source, platform, isTracked: true };
}
