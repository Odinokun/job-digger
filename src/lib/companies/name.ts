/**
 * Everything that is not a letter or a digit: spaces, hyphens, dots, ampersands,
 * quotes.
 *
 * `\p{L}` and `\p{N}` instead of `a-z0-9` - company names are not translated, so
 * "Нова Пошта" has to stay a name rather than turn into an empty string. This needs
 * the `u` flag.
 */
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]/gu;

/**
 * A company name in a form fit only for comparison.
 *
 * "Rolls-Royce", "Rolls Royce", "RollsRoyce" and "rollsRoyce" are one company
 * written four ways, and the user expects the app to see that. So case and
 * punctuation are dropped, and only letters and digits remain.
 *
 * This form does not need to be stored anywhere: it is needed once per company
 * added, not in the list (`findCompaniesByName` in
 * [`server/companies/duplicates.ts`](../../server/companies/duplicates.ts)).
 *
 * A name match is **a warning, not a ban**: "Ernst & Young" and "ErnstYoung" match,
 * but so do two really different companies with the same name. The decision stays
 * with the user.
 */
export function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(NOT_LETTER_OR_DIGIT, "");
}

/**
 * Whether this is the same company as far as the name goes.
 *
 * Two names with no letter or digit left are not considered one company:
 * otherwise "---" and "!!!" would match, though they have nothing in common.
 */
export function sameCompanyName(one: string, other: string): boolean {
  const normalized = normalizeCompanyName(one);

  return normalized !== "" && normalized === normalizeCompanyName(other);
}
