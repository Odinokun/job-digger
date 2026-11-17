import type { UrlRefusalReason } from "@/lib/companies/url";

/**
 * Ключ перекладу для причини, через яку адресу не прийняли.
 *
 * Тексти спільні для обох модалок (`CompaniesPage.urlErrors`): «Введіть адресу»
 * не залежить від того, додають компанію чи карʼєрну сторінку, а дві копії тих
 * самих рядків розходилися б.
 */
export const URL_ERROR_KEYS: Record<UrlRefusalReason, string> = {
  empty: "empty",
  "not-a-url": "notAnAddress",
  "unsupported-scheme": "unsupportedScheme",
};
