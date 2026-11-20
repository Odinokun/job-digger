import {
  detectPlatform,
  platformHostSuffix,
  type CareerPlatform,
} from "./platform.ts";
import { companyUrlHost, normalizeCompanyUrl } from "./url.ts";

/** Що підставити в поля модалки Add company за однією вставленою адресою. */
export type CompanyFieldSuggestion = {
  /** Головний сайт компанії. Порожній, якщо з адреси його не видно. */
  url: string;
  /** Назва компанії, вгадана з адреси. */
  name: string;
  /** Карʼєрна сторінка. Порожня, якщо адреса на неї не схожа. */
  careerUrl: string;
};

/** Нічого не підказуємо: адресу використати не можна. */
const NOTHING: CompanyFieldSuggestion = { url: "", name: "", careerUrl: "" };

/**
 * Суфікси, які самі по собі назвою компанії бути не можуть.
 *
 * Потрібні для доменів другого рівня: у `bosch.com.ua` передостанній лейбл -
 * `com`, і без цього списку компанія звалася б «Com». Повний Public Suffix List
 * сюди не тягнемо: він великий, оновлюється окремо від нас, а поле назви
 * редаговане - сім суфіксів покривають практично все, що трапляється.
 */
const SECOND_LEVEL_SUFFIXES = ["co", "com", "net", "org", "gov", "edu", "ac"];

/**
 * Сегмент шляху, що виглядає як мовний код: `de`, `uk`, `en-US`, `de-de`.
 *
 * Форма, а не список ISO 639-1: список довелося б дорости до всіх кодів і
 * тримати актуальним, а вигоди - лише на рідких випадках. Евристика помилиться
 * на `bosch.com/hr` (Хорватія чи розділ HR), і це прийнято: поле редаговане,
 * тому ціна помилки - одне виправлення руками замість двох.
 */
const LANGUAGE_SEGMENT_PATTERN = /^[a-z]{2}(-[a-z]{2})?$/i;

/**
 * Платформи, у яких назва компанії стоїть у субдомені, а не в шляху:
 * `bosch.wd3.myworkdayjobs.com` і `acme.peopleforce.io` проти
 * `jobs.lever.co/spotify`.
 */
const SUBDOMAIN_SLUG_PLATFORMS: CareerPlatform[] = [
  "workday",
  "peopleforce",
  "breezy",
  "hurma",
  "personio",
  "softgarden",
  "bamboohr",
];

/**
 * Підказки для полів Add company, виведені з однієї вставленої адреси.
 *
 * Жодного запиту в мережу: усе видно з самого рядка. Справжній пошук сторінок
 * (Find pages) приходить в етапі 5 - ця евристика лишиться для випадків, коли
 * сайт не відповідає, тому всі поля редаговані й підказка ні до чого не
 * зобовʼязує.
 */
export function suggestCompanyFields(input: string): CompanyFieldSuggestion {
  const normalized = normalizeCompanyUrl(input);

  if (!normalized.ok) {
    return NOTHING;
  }

  const host = companyUrlHost(normalized.url);
  const platform = detectPlatform(normalized.url);

  // Адреса ATS - це карʼєрна сторінка, а не сайт компанії: `lever.co` головним
  // сайтом Spotify не є, а вгадати `spotify.com` із slug-а не можна - буває
  // і `.io`, і `.ai`. Тому поле сайту лишається порожнім, його заповнює
  // користувач (або Find pages в етапі 5).
  if (platform !== "unsupported") {
    return {
      url: "",
      name: companyNameFromPlatformUrl(normalized.url, host, platform),
      careerUrl: normalized.url,
    };
  }

  // Національна версія сайту (`bosch.com/de`) - це все ще головний сайт, а не
  // окрема сторінка: шлях лишається в адресі сайту, бо без нього `bosch.com`
  // веде на інший, глобальний сайт. Карʼєрне поле ця адреса не заповнює.
  if (isNationalSiteUrl(normalized.url, host)) {
    return {
      url: normalized.url,
      name: companyNameFromHost(host),
      careerUrl: "",
    };
  }

  return {
    url: host,
    name: companyNameFromHost(host),
    // Усе, що після домену, - це вже не головний сайт, а конкретна сторінка:
    // якщо користувач вставив її, вона йде в поле карʼєрної сторінки, щоб шлях
    // не загубився при обрізанні до домену.
    careerUrl: normalized.url === host ? "" : normalized.url,
  };
}

/**
 * Назва компанії з адреси ATS: `jobs.lever.co/spotify` - «Spotify».
 *
 * Порожній рядок означає, що компанії в адресі немає: сама `peopleforce.io`
 * чи `jobs.lever.co` без slug-а - це сторінка платформи, не компанії.
 */
function companyNameFromPlatformUrl(
  normalizedUrl: string,
  host: string,
  platform: CareerPlatform,
): string {
  const slug =
    platform === "cleverstaff"
      ? cleverstaffAlias(normalizedUrl, host)
      : SUBDOMAIN_SLUG_PLATFORMS.includes(platform)
        ? platformSubdomain(host)
        : firstPathSegment(normalizedUrl, host);

  return slug === "" ? "" : titleCase(slug);
}

/**
 * Аліас компанії з дошки CleverStaff: `cleverstaff.net/i/8allocate-vacancies` -
 * `8allocate`. Посилання на окрему вакансію (`/i/vacancy-...`) компанії не
 * називає.
 */
function cleverstaffAlias(normalizedUrl: string, host: string): string {
  const page = normalizedUrl.slice(host.length).split("/").filter(Boolean)[1];
  return page?.endsWith("-vacancies")
    ? page.slice(0, -"-vacancies".length)
    : "";
}

/** Перший лейбл перед суфіксом платформи: `bosch.wd3.myworkdayjobs.com` - `bosch`. */
function platformSubdomain(host: string): string {
  const suffix = platformHostSuffix(host);

  if (suffix === null || host === suffix) {
    return "";
  }

  // Платформа може додавати свої лейбли (`wd3` у Workday), тому беремо перший:
  // саме його задає компанія.
  return host.slice(0, host.length - suffix.length - 1).split(".")[0];
}

/**
 * Чи адреса схожа на національну версію сайту: `bosch.com/de`, `bosch.com/en-US`.
 *
 * Дивимося лише на шлях: query національну версію не скасовує, бо нею іноді
 * саму версію й задають (`bosch.com/de?lang=de`).
 */
function isNationalSiteUrl(normalizedUrl: string, host: string): boolean {
  const segments = pathSegments(normalizedUrl, host);

  return segments.length === 1 && LANGUAGE_SEGMENT_PATTERN.test(segments[0]);
}

/** Перший сегмент шляху: `jobs.lever.co/spotify/jobs` - `spotify`. */
function firstPathSegment(normalizedUrl: string, host: string): string {
  return pathSegments(normalizedUrl, host)[0] ?? "";
}

/** Сегменти шляху без порожніх: `bosch.com/de/careers/` - `["de", "careers"]`. */
function pathSegments(normalizedUrl: string, host: string): string[] {
  return normalizedUrl
    .slice(host.length)
    .split("?")[0]
    .split("/")
    .filter((segment) => segment !== "");
}

/** Назва компанії з хоста: `about.gitlab.com` - «Gitlab». */
function companyNameFromHost(host: string): string {
  const labels = host.split(".");

  // Передостанній лейбл: у `bosch.com` це `bosch`, у `about.gitlab.com` -
  // `gitlab`. Для домену другого рівня крок назад повторюється.
  let index = labels.length - 2;

  if (index > 0 && SECOND_LEVEL_SUFFIXES.includes(labels[index])) {
    index -= 1;
  }

  return titleCase(labels[index] ?? labels[0]);
}

/** `acme-corp` - «Acme Corp». */
function titleCase(label: string): string {
  return label
    .split(/[-_]+/)
    .filter((word) => word !== "")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
