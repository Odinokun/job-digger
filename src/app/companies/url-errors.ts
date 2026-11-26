import type { UrlRefusalReason } from "@/lib/companies/url";

/**
 * The translation key for the reason an address was refused.
 *
 * The texts are shared by both modals (`CompaniesPage.urlErrors`): "Enter an
 * address" does not depend on whether a company or a career page is being added,
 * and two copies of the same strings would drift apart.
 */
export const URL_ERROR_KEYS: Record<UrlRefusalReason, string> = {
  empty: "empty",
  "not-a-url": "notAnAddress",
  "unsupported-scheme": "unsupportedScheme",
};
