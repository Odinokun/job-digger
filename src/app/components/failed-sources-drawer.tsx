"use client";

import { Button, Drawer, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import type {
  FailedSource,
  FailedSourcesList,
  FailureReason,
} from "@/lib/checks/failed-sources";

import { retryFailedSourcesAction } from "./check-actions";
import { useActionFailedToast } from "./use-action-failed-toast";

/** How often to re-read the list while some Retry is still queued. */
const REFRESH_WHILE_RETRYING_MS = 2000;

interface FailedSourcesDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * The Failed Sources Drawer (src/server/checks/README.md): the failed sources of
 * the last general check with Retry and Retry all failed. The list rules are in
 * `server/checks/README.md`, "Failed sources".
 *
 * While some Retry is queued, the list is re-read every 2 s. When a Retry ends,
 * the page is re-read from the server (`router.refresh`): found vacancies change
 * the unread counter. When no failed sources are left, the drawer does not close
 * itself - the result of Retry has to stay visible.
 */
export function FailedSourcesDrawer({
  isOpen,
  onOpenChange,
}: FailedSourcesDrawerProps) {
  const t = useTranslations("FailedSources");
  const router = useRouter();
  const showActionFailed = useActionFailedToast();
  const [list, setList] = useState<FailedSourcesList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isRetryPending, startRetry] = useTransition();
  // What exactly is being queued now: the button shows a spinner through
  // `isPending` instead of being disabled - `isDisabled` would drop focus from
  // the drawer, and Escape would no longer close it.
  const [requested, setRequested] = useState<string[] | "all" | null>(null);
  const retryingBefore = useRef(0);

  /** The fresh list into state - called once the response has arrived. */
  const apply = useCallback(
    (next: FailedSourcesList | null) => {
      if (next === null) {
        setLoadFailed(true);
        return;
      }
      setList(next);
      setLoadFailed(false);

      // A Retry has ended - found vacancies change the unread counter.
      const retrying = next.items.filter((item) => item.isRetrying).length;
      if (retrying < retryingBefore.current) router.refresh();
      retryingBefore.current = retrying;
    },
    [router],
  );

  const load = useCallback(() => fetchFailedSources().then(apply), [apply]);

  useEffect(() => {
    if (isOpen) void fetchFailedSources().then(apply);
  }, [isOpen, apply]);

  const isRetrying = list?.items.some((item) => item.isRetrying) ?? false;

  useEffect(() => {
    if (!isOpen || !isRetrying) return;
    const timer = setTimeout(
      () => void fetchFailedSources().then(apply),
      REFRESH_WHILE_RETRYING_MS,
    );
    return () => clearTimeout(timer);
  }, [isOpen, isRetrying, list, apply]);

  const retry = (sourceIds: string[] | "all") => {
    if (isRetryPending) return;
    setRequested(sourceIds);
    startRetry(async () => {
      const result = await retryFailedSourcesAction(sourceIds);
      if (!result.ok && result.reason === "unexpected") {
        showActionFailed();
      }
      await load();
      setRequested(null);
    });
  };

  const isRequested = (sourceId: string) =>
    isRetryPending &&
    (requested === "all" || (requested?.includes(sourceId) ?? false));

  const canRetry = list?.canRetry ?? false;
  const retryable = list?.items.filter((item) => !item.isRetrying) ?? [];

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Content placement="right">
        <Drawer.Dialog>
          <Drawer.CloseTrigger />
          <Drawer.Header>
            <Drawer.Heading>{t("title")}</Drawer.Heading>
          </Drawer.Header>
          <Drawer.Body>
            {loadFailed ? (
              <p className="text-sm text-danger">{t("loadFailed")}</p>
            ) : list === null ? (
              <Spinner size="sm" />
            ) : list.items.length === 0 ? (
              <p className="text-sm text-muted">{t("empty")}</p>
            ) : (
              <>
                {canRetry ? null : (
                  <p className="mb-3 text-sm text-muted">{t("checkRunning")}</p>
                )}
                <ul className="flex flex-col divide-y">
                  {list.items.map((item) => (
                    <li
                      key={item.sourceId}
                      className="flex items-start justify-between gap-3 py-3"
                    >
                      <FailedSourceRow item={item} />
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={!canRetry}
                        isPending={
                          item.isRetrying || isRequested(item.sourceId)
                        }
                        onPress={() => retry([item.sourceId])}
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? (
                              <Spinner color="current" size="sm" />
                            ) : null}
                            {t("retry")}
                          </>
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <Button slot="close" variant="secondary">
              {t("close")}
            </Button>
            <Button
              isDisabled={!canRetry || retryable.length === 0}
              isPending={isRetryPending && requested === "all"}
              onPress={() => retry("all")}
            >
              {t("retryAll")}
            </Button>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

/** The list from the server, or `null` if it could not be fetched. */
async function fetchFailedSources(): Promise<FailedSourcesList | null> {
  try {
    const response = await fetch("/api/failed-sources", { cache: "no-store" });
    return response.ok ? ((await response.json()) as FailedSourcesList) : null;
  } catch {
    return null;
  }
}

function FailedSourceRow({ item }: { item: FailedSource }) {
  const t = useTranslations("FailedSources");

  return (
    <div className="min-w-0">
      <p className="font-medium text-foreground">
        {item.companyName}
        {item.label ? (
          <span className="ml-2 text-sm text-muted">{item.label}</span>
        ) : null}
      </p>
      {/* The address as text: content from websites is never rendered as HTML. */}
      <p className="truncate text-sm text-muted">{item.url}</p>
      <p className="text-sm text-danger">{reasonText(t, item)}</p>
    </div>
  );
}

function reasonText(
  t: ReturnType<typeof useTranslations<"FailedSources">>,
  item: FailedSource,
): string {
  const keys: Record<FailureReason, string> = {
    "not-found": "reasons.notFound",
    unreadable: "reasons.unreadable",
    "bad-status": "reasons.badStatus",
    "fetch-failed": "reasons.fetchFailed",
    stalled: "reasons.stalled",
    abandoned: "reasons.abandoned",
    crashed: "reasons.crashed",
  };

  return t(keys[item.reason] as "reasons.notFound", {
    status: item.httpStatus ?? 0,
  });
}
