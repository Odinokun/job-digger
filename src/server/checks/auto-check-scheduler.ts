/**
 * Тік розкладу автоперевірки (задача 6.03). Самого рішення «чи вже час» тут
 * немає - лише коли питати: одразу на старті й далі раз на `tickMs`.
 *
 * Короткий тік, а не один таймер на весь інтервал: час наступної перевірки
 * рахується з годинника й бази (`auto-check-schedule.ts`), тож після сну
 * компʼютера прострочена перевірка стартує на найближчому тіку, а не через ще
 * один повний інтервал. Чи рахує таймер Node час сну на macOS, не перевірено -
 * і покладатися на це не треба.
 */

/** Як часто питати розклад. Сам прохід - кілька легких запитів до бази. */
export const AUTO_CHECK_TICK_MS = 60_000;

export interface AutoCheckSchedulerOptions {
  /** Один прохід розкладу; `isStartup` - перший після старту застосунку. */
  runPass: (isStartup: boolean) => Promise<void>;
  tickMs?: number;
}

export interface AutoCheckScheduler {
  start(): void;
  /** Зупиняє тік і чекає, поки добіжить прохід, що йде. */
  stop(): Promise<void>;
}

export function createAutoCheckScheduler({
  runPass,
  tickMs = AUTO_CHECK_TICK_MS,
}: AutoCheckSchedulerOptions): AutoCheckScheduler {
  let timer: NodeJS.Timeout | undefined;
  let stopped = true;
  let current: Promise<void> = Promise.resolve();

  function pass(isStartup: boolean): void {
    // Наступний тік - лише після завершення цього: проходи не накладаються.
    // Збій не зупиняє розклад: наступний тік спробує знову.
    current = runPass(isStartup)
      .catch((error: unknown) => {
        console.error("Auto check pass failed", error);
      })
      .finally(schedule);
  }

  function schedule(): void {
    if (stopped) return;
    timer = setTimeout(() => pass(false), tickMs);
    // Таймер не тримає процес живим: сервер зупиняється, не чекаючи розкладу.
    timer.unref();
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      pass(true);
    },
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await current;
    },
  };
}
