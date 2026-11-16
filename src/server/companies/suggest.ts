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

  return {
    url: host,
    name: companyNameFromHost(host),
    // Усе, що після домену, - це вже не головний сайт, а конкретна сторінка:
    // якщо користувач вставив її, вона йде в поле карʼєрної сторінки, щоб шлях
    // не загубився при обрізанні до домену.
    careerUrl: normalized.url === host ? "" : normalized.url,
  };
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
