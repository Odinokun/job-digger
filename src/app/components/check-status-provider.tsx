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
  /** The last known state; `null` - the first poll has not answered yet. */
  status: CheckStatus | null;
  /** A state known without polling (the Check all response). */
  track: (status: CheckStatus) => void;
}

const CheckStatusContext = createContext<CheckStatusContextValue | null>(null);

interface CheckStatusProviderProps {
  /** The unread count the server has just rendered the page with. */
  initialUnread: number;
  children: ReactNode;
}

/**
 * The general check state for the whole app: polls `/api/check-status`
 * (`lib/checks/status-poller.ts`) and hands the state to components through
 * `useCheckStatus`.
 *
 * When the unread count changes or a check or Find new pages ends, the page is
 * re-read from the server (`router.refresh`): the menu counter and the tab title
 * are rendered there. Client state stays as it is
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
  // What the page already shows: the number from the last server render or poll.
  const shownUnread = useRef(initialUnread);
  const wasRunning = useRef(false);

  // The latest `router` and `t` go through a ref: their identity can change
  // after every Server Action, while the poller has to live as long as the page
  // is open. Otherwise every action would restart it with an extra poll.
  const latest = useRef({ router, t });

  useEffect(() => {
    latest.current = { router, t };
  });

  // Only when the server really rendered a new number: on every render this
  // would reset the value just polled to the old one and call `refresh` again.
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
        // A general check or Find new pages has ended - the server renders the
        // tab and menu counters.
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

    // A hidden tab is not polled outside a check: when it is shown again, ask at
    // once (https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event).
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
