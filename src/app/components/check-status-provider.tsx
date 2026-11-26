"use client";

import { toast } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CheckStatus } from "@/lib/checks/check-status";
import {
  createStatusPoller,
  isBusy,
  type StatusPoller,
} from "@/lib/checks/status-poller";

interface CheckStatusContextValue {
  /** Останній відомий стан; `null` - перше опитування ще не відповіло. */
  status: CheckStatus | null;
  /** Стан, відомий без опитування (відповідь Check all). */
  track: (status: CheckStatus) => void;
}

const CheckStatusContext = createContext<CheckStatusContextValue | null>(null);

interface CheckStatusProviderProps {
  /** Непрочитані, з якими сервер щойно відрендерив сторінку. */
  initialUnread: number;
  children: ReactNode;
}

/**
 * Стан загальної перевірки для всього застосунку: опитує `/api/check-status`
 * (`lib/checks/status-poller.ts`) і роздає стан компонентам через
 * `useCheckStatus`.
 *
 * Коли змінилася кількість непрочитаних або закінчилась перевірка чи Find new
 * pages, сторінка
 * перечитується з сервера (`router.refresh`): лічильник у меню й назва вкладки
 * рендеряться там. Клієнтський стан при цьому лишається
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md).
 */
export function CheckStatusProvider({
  initialUnread,
  children,
}: CheckStatusProviderProps) {
  const router = useRouter();
  const t = useTranslations("Errors");
  const [status, setStatus] = useState<CheckStatus | null>(null);
  const poller = useRef<StatusPoller | null>(null);
  // Що вже показує сторінка: число з останнього рендера сервера чи опитування.
  const shownUnread = useRef(initialUnread);
  const wasRunning = useRef(false);

  // Свіжі `router` і `t` - через ref: їхня ідентичність може мінятися після
  // кожної Server Action, а опитувач має жити весь час, поки відкрита сторінка.
  // Інакше кожна дія перезапускала б його з позачерговим опитуванням.
  const latest = useRef({ router, t });

  useEffect(() => {
    latest.current = { router, t };
  });

  // Лише коли сервер справді відрендерив нове число: на кожному рендері це
  // скидало б щойно опитане значення до старого й смикало `refresh` знову.
  useEffect(() => {
    shownUnread.current = initialUnread;
  }, [initialUnread]);

  useEffect(() => {
    const current = createStatusPoller({
      fetchStatus: async () => {
        const response = await fetch("/api/check-status", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(`Check status responded ${response.status}`);
        }
        return (await response.json()) as CheckStatus;
      },
      onStatus: (next) => {
        setStatus(next);
        // Закінчилась загальна перевірка чи Find new pages - лічильники
        // вкладок і меню рендерить сервер.
        const finished = wasRunning.current && !isBusy(next);
        wasRunning.current = isBusy(next);
        if (next.unread !== shownUnread.current || finished) {
          shownUnread.current = next.unread;
          latest.current.router.refresh();
        }
      },
      onLost: () => {
        toast.danger(latest.current.t("connectionLost"));
      },
      isHidden: () => document.visibilityState === "hidden",
    });
    poller.current = current;
    current.start();

    // Поза перевіркою прихована вкладка не опитується: коли її знову
    // показали, питаємо одразу (https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event).
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") current.resume();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      current.stop();
      poller.current = null;
    };
  }, []);

  const value: CheckStatusContextValue = {
    status,
    track: (next) => poller.current?.track(next),
  };

  return (
    <CheckStatusContext.Provider value={value}>
      {children}
    </CheckStatusContext.Provider>
  );
}

export function useCheckStatus(): CheckStatusContextValue {
  const value = useContext(CheckStatusContext);
  if (value === null) {
    throw new Error("useCheckStatus must be used inside CheckStatusProvider");
  }
  return value;
}
