/**
 * Усе, що не літера й не цифра: пробіли, дефіси, крапки, амперсанди, лапки.
 *
 * `\p{L}` і `\p{N}` замість `a-z0-9` - назви компаній не перекладаються, тож
 * «Нова Пошта» має лишатися назвою, а не перетворюватися на порожній рядок.
 * Для цього потрібен прапорець `u`.
 */
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]/gu;

/**
 * Назва компанії у формі, придатній лише для порівняння.
 *
 * «Rolls-Royce», «Rolls Royce», «RollsRoyce» і «rollsRoyce» - одна компанія,
 * записана чотирма способами, і користувач очікує, що застосунок це побачить.
 * Тому регістр і розділові знаки відкидаються, а лишаються самі літери й цифри.
 *
 * Зберігати цю форму нікуди не треба: вона потрібна раз на додавання компанії,
 * а не в списку (`findCompaniesByName` у
 * [`server/companies/duplicates.ts`](../../server/companies/duplicates.ts)).
 *
 * Збіг назв - **попередження, а не заборона**: «Ernst & Young» і «ErnstYoung»
 * зійдуться, але зійдуться й дві справді різні компанії з однаковою назвою.
 * Рішення лишається за користувачем.
 */
export function normalizeCompanyName(name: string): string {
  return name.toLowerCase().replace(NOT_LETTER_OR_DIGIT, "");
}

/**
 * Чи це та сама компанія з погляду назви.
 *
 * Дві назви, у яких не лишилося жодної літери чи цифри, однією компанією не
 * вважаються: інакше «---» і «!!!» зійшлися б, хоч спільного в них нічого.
 */
export function sameCompanyName(one: string, other: string): boolean {
  const normalized = normalizeCompanyName(one);

  return normalized !== "" && normalized === normalizeCompanyName(other);
}
