/**
 * Коли питати сервер про стан перевірки (docs/checks-and-queue.md, розділ 8).
 * Без React і без мережі: що саме питати і що робити з відповіддю, вирішує
 * той, хто створює опитувач (`app/components/check-status-provider.tsx`).
 */
import type { CheckStatus } from "./check-status";

/** Як часто опитувати, поки перевірка йде. */
export const POLL_INTERVAL_MS = 3000;

/** Скільки невдалих опитувань поспіль - і зʼєднання вважається втраченим. */
export const MAX_FAILED_POLLS = 3;

export interface StatusPollerOptions {
  fetchStatus: () => Promise<CheckStatus>;
  onStatus: (status: CheckStatus) => void;
  /** Зʼєднання втрачене - викликається один раз, і опитування зупиняється. */
  onLost: () => void;
  intervalMs?: number;
}

export interface StatusPoller {
  /** Одне опитування зараз - на завантаженні сторінки. */
  start(): void;
  /**
   * Стан, відомий без опитування (відповідь Check all): показується одразу,
   * а якщо перевірка йде - опитування починається.
   */
  track(status: CheckStatus): void;
  stop(): void;
}

export function createStatusPoller({
  fetchStatus,
  onStatus,
  onLost,
  intervalMs = POLL_INTERVAL_MS,
}: StatusPollerOptions): StatusPoller {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let failures = 0;
  let stopped = false;

  function schedule(): void {
    // Одне заплановане чи поточне опитування за раз: `track` посеред
    // опитування не має подвоювати частоту.
    if (stopped || inFlight || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      void poll();
    }, intervalMs);
  }

  async function poll(): Promise<void> {
    if (stopped) return;
    inFlight = true;
    let keepPolling: boolean;

    try {
      const status = await fetchStatus();
      failures = 0;
      if (stopped) return;
      onStatus(status);
      keepPolling = status.run !== null;
    } catch {
      failures += 1;
      if (failures >= MAX_FAILED_POLLS) {
        // До наступного завантаження сторінки опитування не повертається.
        stopped = true;
        onLost();
        return;
      }
      keepPolling = true;
    } finally {
      inFlight = false;
    }

    if (keepPolling) schedule();
  }

  return {
    start() {
      void poll();
    },
    track(status) {
      if (stopped) return;
      onStatus(status);
      if (status.run !== null) schedule();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
