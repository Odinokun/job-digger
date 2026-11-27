import { isUuid } from "../uuid.ts";

/**
 * The keyset pagination cursor: the last row shown.
 *
 * `key` is the value of the field the list is sorted by (the company name; for Jobs,
 * since task 3.15, the detection date in ISO), `id` is the internal key of the same
 * row. The pair is needed because the sort field itself is not unique: two
 * companies may have the same name, and without `id` rows at the page boundary
 * would either disappear or come twice.
 *
 * There is no page number here on purpose: `OFFSET` shifts when new rows appear
 * while the list is being viewed.
 */
export type Cursor = {
  key: string;
  id: string;
};

/**
 * How many characters of `key` we accept.
 *
 * The cursor arrives as a Server Action argument, that is from the client: without
 * a limit one could put a megabyte string there, which would go as a parameter into
 * a database query. Company names are never that long, and an ISO date is 24 characters.
 */
export const MAX_CURSOR_KEY_LENGTH = 512;

/**
 * The cursor from an untrusted value, or `null` if it is not a cursor.
 *
 * `null` instead of an exception: "no cursor" and "a corrupted cursor" are the same
 * for a list, both mean "start from the beginning". We return a new object with only
 * the two known fields, so nothing foreign gets into the query.
 */
export function parseCursor(value: unknown): Cursor | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { key, id } = value as Record<string, unknown>;

  if (typeof key !== "string" || key === "") {
    return null;
  }

  if (key.length > MAX_CURSOR_KEY_LENGTH) {
    return null;
  }

  if (typeof id !== "string" || !isUuid(id)) {
    return null;
  }

  return { key, id };
}
