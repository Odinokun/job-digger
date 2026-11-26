/**
 * `AUTO_CHECK=off` turns automatic checks off completely, including the check at
 * startup (src/server/checks/README.md). Manual checks keep working. It is needed
 * during development and in E2E: there the schedule would start a general check
 * in the middle of a scenario.
 *
 * An invalid value is an error at startup, as with `PARALLEL_SOURCE_CHECKS`:
 * whoever wrote `AUTO_CHECK=false` clearly wanted to turn it off, and quietly
 * keeping the checks on would be worse.
 */
export function parseAutoCheckEnabled(raw: string | undefined): boolean {
  const value = raw?.trim() ?? "";

  if (value === "" || value === "on") {
    return true;
  }

  if (value === "off") {
    return false;
  }

  throw new Error(`AUTO_CHECK must be "on", "off" or empty, got: ${raw}`);
}
