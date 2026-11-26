/**
 * How an attempt to do a Server Action's work ended.
 *
 * Separate from the results of the task itself (`AddCompanyResult` and the
 * like): those describe expected input refusals that the UI shows on form
 * fields, while this type is an unexpected failure the user cannot fix.
 */
export type ActionOutcome<T> =
  { ok: true; value: T } | { ok: false; error: "unexpected" };

/**
 * Runs a Server Action's work so that an unexpected failure becomes a result.
 *
 * An exception from an action reaches the UI crippled: in production Next hides
 * the message and leaves only the `digest`, so the form has nothing to show
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).
 * So we catch it here: the real error with every detail stays in the server log,
 * and only a code goes to the client - the details of a failure mean nothing to
 * whoever clicked the button and must not leak into the browser.
 */
export async function runAction<T>(
  work: () => Promise<T> | T,
): Promise<ActionOutcome<T>> {
  try {
    return { ok: true, value: await work() };
  } catch (failure) {
    // The log is in English - a technical message, not UI text.
    console.error("Server action failed", failure);

    return { ok: false, error: "unexpected" };
  }
}
