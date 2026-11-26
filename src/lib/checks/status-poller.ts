/**
 * Коли питати сервер про стан перевірки (src/server/checks/README.md).
 * Без React і без мережі: що саме питати і що робити з відповіддю, вирішує
 * той, хто створює опитувач (`app/components/check-status-provider.tsx`).
 */
import type { CheckStatus } from "./check-status";

/** Як часто опитувати, поки перевірка йде. */
export const POLL_INTERVAL_MS = 3000;

/**
 * Як часто опитувати, поки перевірки немає: щоб помітити автоперевірку, яка
 * почалась уже після завантаження сторінки. Розклад сам дивиться раз на
 * хвилину (`server/checks/auto-check-scheduler.ts`), частіше питати марно.
 */
export const IDLE_POLL_INTERVAL_MS = 60_000;

/** Скільки невдалих опитувань поспіль - і зʼєднання вважається втраченим. */
export const MAX_FAILED_POLLS = 3;

export interface StatusPollerOptions {
  fetchStatus: () => Promise<CheckStatus>;
  onStatus: (status: CheckStatus) => void;
  /** Зʼєднання втрачене - викликається один раз, і опитування зупиняється. */
  onLost: () => void;
  intervalMs?: number;
  idleIntervalMs?: number;
  /**
   * Чи прихована вкладка. Поза перевіркою прихована вкладка не опитується;
   * коли її знову показали, власник кличе `resume`.
   */
  isHidden?: () => boolean;
}

export interface StatusPoller {
  /** Одне опитування зараз - на завантаженні сторінки. */
  start(): void;
  /**
   * Стан, відомий без опитування (відповідь Check all): показується одразу,
   * а якщо перевірка йде - опитування починається.
   */
  track(status: CheckStatus): void;
  /** Вкладку знову показали: опитати зараз, не чекаючи таймера. */
  resume(): void;
  stop(): void;
}

export function createStatusPoller({
  fetchStatus,
  onStatus,
  onLost,
  intervalMs = POLL_INTERVAL_MS,
  idleIntervalMs = IDLE_POLL_INTERVAL_MS,
  isHidden = () => false,
}: StatusPollerOptions): StatusPoller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let failures = 0;
  let stopped = false;
  // Чи йде перевірка за останньою відомою відповіддю - від цього частота.
  let busy = false;

  function cancel(): void {
    clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delay: number): void {
    // Одне заплановане чи поточне опитування за раз: `track` посеред
    // опитування не має подвоювати частоту.
    if (stopped || inFlight || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      // Поза перевіркою прихована вкладка не опитується - до `resume`.
      if (!busy && isHidden()) return;
      void poll();
    }, delay);
  }

  async function poll(): Promise<void> {
    if (stopped) return;
    inFlight = true;

    try {
      const status = await fetchStatus();
      failures = 0;
      if (stopped) return;
      busy = isBusy(status);
      onStatus(status);
    } catch {
      failures += 1;
      if (failures >= MAX_FAILED_POLLS) {
        // До наступного завантаження сторінки опитування не повертається.
        stopped = true;
        onLost();
        return;
      }
    } finally {
      inFlight = false;
    }

    // Після невдачі - швидкий повтор: інакше збій поза перевіркою
    // помічався б лише за три хвилини.
    schedule(busy || failures > 0 ? intervalMs : idleIntervalMs);
  }

  return {
    start() {
      void poll();
    },
    track(status) {
      if (stopped) return;
      onStatus(status);
      busy = isBusy(status);
      if (busy) {
        // Повільний таймер замінюється швидким.
        if (!inFlight) cancel();
        schedule(intervalMs);
      }
    },
    resume() {
      if (stopped || inFlight) return;
      cancel();
      void poll();
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}

/** Чи йде щось, за чим варто стежити: загальна перевірка чи Find new pages. */
export function isBusy(status: CheckStatus): boolean {
  return status.run !== null || status.findingNewPages;
}
