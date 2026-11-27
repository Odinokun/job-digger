/**
 * Whether a value has the UUID form. Ids come from the client (Server Action
 * arguments, the cursor), and a malformed value in a `uuid` column is a database
 * error, not "not found".
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
