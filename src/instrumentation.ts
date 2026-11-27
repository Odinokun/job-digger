/**
 * Code Next runs once when the server starts
 * (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
 */
export async function register(): Promise<void> {
  // The Edge runtime has neither `pg` nor Node timers - the queue loop runs only in Node.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startQueueWorker } = await import("@/server/queue/start");
    startQueueWorker();

    // The schedule only queues a general check - the loop above runs it.
    const { startAutoChecks } =
      await import("@/server/checks/start-auto-checks");
    startAutoChecks();
  }
}
