import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { normalizeCompanyUrl } from "../../lib/companies/url.ts";
import { careerSources, companies } from "./schema.ts";

/**
 * Карʼєрне джерело демо-компанії: без `companyId`, його дає вставка.
 * `normalizedUrl` теж не задається руками - його рахує та сама функція, що й
 * ручне додавання джерела.
 */
type DemoSource = Omit<
  typeof careerSources.$inferInsert,
  "id" | "companyId" | "normalizedUrl" | "createdAt" | "lastSuccessAt"
> & {
  /** Скільки днів тому джерело останнього разу прочиталося без помилки. */
  lastSuccessDaysAgo?: number;
};

/**
 * Демо-компанія. `normalizedUrl` не задається руками: його обчислює та сама
 * функція, що й ручне додавання компанії.
 */
type DemoCompany = Omit<
  typeof companies.$inferInsert,
  "id" | "userId" | "url" | "normalizedUrl" | "createdAt"
> & {
  /**
   * Головний сайт у демо-даних є завжди, хоч у схемі колонка й необовʼязкова:
   * компанію без сайту перевіряють окремі тести, а не демо-набір.
   */
  url: string;
  sources: DemoSource[];
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Набір компаній для ручної перевірки сторінки Companies.
 *
 * Адреси справжні й перевірені: у етапі 3 той самий набір знадобиться, щоб
 * прогнати парсери й Check now на реальних сторінках. Статуси й лічильники
 * помилок виставлені руками - перевірка їх ще не рахувала.
 *
 * Набір покриває всі стани списку: обидві вкладки, компанію з двома джерелами,
 * компанію з помилками і кожне значення `discovery_status` з вкладки Not tracked.
 * Платформи `schema_org` тут поки немає - вона приходить із парсером 3.11.
 */
export const DEMO_COMPANIES: DemoCompany[] = [
  {
    name: "GitLab",
    url: "https://about.gitlab.com",
    sources: [
      {
        url: "https://job-boards.greenhouse.io/gitlab",
        platform: "greenhouse",
        lastSuccessDaysAgo: 1,
      },
    ],
  },
  {
    // Компанія з двома джерелами: дошка Lever і власна сторінка, яку нічим
    // прочитати. Прогрес і Retry рахуються по джерелах, тому такий випадок
    // потрібен для ручної перевірки.
    name: "Spotify",
    url: "https://www.spotify.com",
    sources: [
      {
        url: "https://jobs.lever.co/spotify",
        platform: "lever",
        lastSuccessDaysAgo: 1,
      },
      {
        url: "https://www.lifeatspotify.com/jobs",
        platform: "unsupported",
        isTracked: false,
      },
    ],
  },
  {
    name: "Linear",
    url: "https://linear.app",
    sources: [
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        lastSuccessDaysAgo: 2,
      },
    ],
  },
  {
    name: "NVIDIA",
    url: "https://www.nvidia.com",
    sources: [
      {
        url: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
        platform: "workday",
        lastSuccessDaysAgo: 3,
      },
    ],
  },
  {
    // Джерело з помилками: показує «Has errors» і «Last ok: 12 days ago».
    name: "Palantir",
    url: "https://www.palantir.com",
    sources: [
      {
        url: "https://jobs.lever.co/palantir",
        platform: "lever",
        consecutiveFailures: 3,
        lastSuccessDaysAgo: 12,
      },
    ],
  },
  {
    name: "PeopleForce",
    url: "https://peopleforce.io",
    sources: [
      {
        url: "https://careers.peopleforce.io",
        platform: "peopleforce",
        lastSuccessDaysAgo: 1,
      },
    ],
  },
  {
    // Сторінку знайдено, але читати її нічим: компанія лишається в Not tracked,
    // а адреса зберігається - знадобиться, якщо зʼявляться нові способи читання.
    name: "Google",
    url: "https://www.google.com",
    discoveryStatus: "unsupported",
    sources: [
      {
        url: "https://careers.google.com",
        platform: "unsupported",
        isTracked: false,
      },
    ],
  },
  {
    name: "Berkshire Hathaway",
    url: "https://www.berkshirehathaway.com",
    discoveryStatus: "not_found",
    sources: [],
  },
  {
    name: "Valve",
    url: "https://www.valvesoftware.com",
    discoveryStatus: "check_failed",
    sources: [],
  },
];

/** Скільки рядків справді вставив цей запуск. */
export type DemoSeedResult = {
  companies: number;
  sources: number;
};

/**
 * Додає демо-компанії користувачу й повертає кількість вставлених рядків.
 *
 * База передається аргументом, як і в `seedSystemUser`: так та сама функція
 * працює і на базі розробки (`npm run db:seed:demo`), і на тестовій базі.
 *
 * Запуск кілька разів безпечний. Компанію боронить unique-індекс
 * `(user_id, normalized_url)`, тому для неї достатньо `onConflictDoNothing()`.
 * На `career_sources` unique-індексу немає свідомо (див. README), тому джерела
 * вставляються лише разом із новою компанією: компанію, яка вже є, скрипт не
 * торкається зовсім, і доданого чи прибраного руками джерела не чіпає.
 */
export async function seedDemoCompanies(
  db: NodePgDatabase,
  userId: string,
): Promise<DemoSeedResult> {
  const seededAt = Date.now();

  return db.transaction(async (tx) => {
    const result: DemoSeedResult = { companies: 0, sources: 0 };

    for (const demo of DEMO_COMPANIES) {
      const normalized = normalizeCompanyUrl(demo.url);

      if (!normalized.ok) {
        throw new Error(
          `Demo company "${demo.name}" has an unusable url: ${demo.url} (${normalized.reason})`,
        );
      }

      const [company] = await tx
        .insert(companies)
        .values({
          userId,
          name: demo.name,
          url: demo.url,
          normalizedUrl: normalized.url,
          discoveryStatus: demo.discoveryStatus,
        })
        .onConflictDoNothing()
        .returning();

      // Компанія вже була: ні її, ні її джерел не торкаємось.
      if (!company) {
        continue;
      }

      result.companies += 1;

      if (demo.sources.length === 0) {
        continue;
      }

      const inserted = await tx
        .insert(careerSources)
        .values(
          demo.sources.map(({ lastSuccessDaysAgo, ...source }) => ({
            ...source,
            companyId: company.id,
            normalizedUrl: demoSourceNormalizedUrl(demo.name, source.url),
            lastSuccessAt:
              lastSuccessDaysAgo === undefined
                ? null
                : new Date(seededAt - lastSuccessDaysAgo * DAY_IN_MS),
          })),
        )
        .returning();

      result.sources += inserted.length;
    }

    return result;
  });
}

/**
 * Очищена адреса демо-джерела. Непридатна адреса тут - помилка в самих демо-даних,
 * тому виняток, а не мовчазний пропуск: те саме правило, що для адреси компанії.
 */
function demoSourceNormalizedUrl(companyName: string, url: string): string {
  const normalized = normalizeCompanyUrl(url);

  if (!normalized.ok) {
    throw new Error(
      `Demo company "${companyName}" has an unusable career source url: ${url} (${normalized.reason})`,
    );
  }

  return normalized.url;
}
