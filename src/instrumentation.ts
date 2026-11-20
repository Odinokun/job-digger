/**
 * Код, який Next виконує один раз на старті сервера
 * (node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
 */
export async function register(): Promise<void> {
  // Edge-середовище не має ні `pg`, ні таймерів Node - цикл черги лише в Node.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startQueueWorker } = await import("@/server/queue/start");
    startQueueWorker();

    // Розклад лише ставить загальну перевірку в чергу - виконує її цикл вище.
    const { startAutoChecks } =
      await import("@/server/checks/start-auto-checks");
    startAutoChecks();
  }
}
