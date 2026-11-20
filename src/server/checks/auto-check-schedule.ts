/**
 * Розклад автоматичної перевірки (docs/checks-and-queue.md, розділ 8; задача
 * 6.02).
 *
 * Відлік - від **старту** останньої загальної перевірки, автоматичної чи
 * ручної: ручний Check all перезапускає відлік, тож дві перевірки поспіль не
 * йдуть. Хто й коли питає «чи вже час» - задача 6.03.
 */
import { eq, max } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkRuns } from "../db/schema.ts";

const HOUR_MS = 3_600_000;

/**
 * На старті застосунку загальна перевірка йде одразу, якщо остання стартувала
 * давніше за це (docs/checks-and-queue.md, розділ 8, «Локально»).
 */
export const STARTUP_CHECK_AFTER_MS = HOUR_MS;

/**
 * Коли настає наступна автоперевірка. `null` - загальної перевірки ще не було,
 * і чекати нема чого: вона потрібна одразу.
 *
 * Рахується від поточного інтервалу, а не від того, що діяв на момент
 * перевірки: змінений у Settings інтервал діє одразу.
 */
export function nextAutoCheckAt(
  lastStartedAt: Date | null,
  intervalHours: number,
): Date | null {
  return lastStartedAt === null
    ? null
    : new Date(lastStartedAt.getTime() + intervalHours * HOUR_MS);
}

/**
 * Чи настав час автоперевірки. Пропущений час (компʼютер спав) не
 * накопичується: скільки б інтервалів не минуло, перевірка одна.
 */
export function isAutoCheckDue({
  lastStartedAt,
  intervalHours,
  now,
}: {
  lastStartedAt: Date | null;
  intervalHours: number;
  now: Date;
}): boolean {
  const next = nextAutoCheckAt(lastStartedAt, intervalHours);

  return next === null || now.getTime() >= next.getTime();
}

/**
 * Чи йти загальній перевірці на старті застосунку: остання стартувала понад
 * годину тому або її не було. Інакше відлік продовжується за інтервалом
 * (`isAutoCheckDue`).
 */
export function isStartupCheckDue({
  lastStartedAt,
  now,
}: {
  lastStartedAt: Date | null;
  now: Date;
}): boolean {
  return (
    lastStartedAt === null ||
    now.getTime() - lastStartedAt.getTime() > STARTUP_CHECK_AFTER_MS
  );
}

/**
 * Старт останньої загальної перевірки користувача або `null`, якщо їх не
 * було. Перевірка, що ще йде, теж рахується: від неї й відлік, тож розклад не
 * запустить другу поверх неї.
 *
 * Check now і Retry рядка в `check_runs` не мають, тож відлік не зсувають.
 */
export async function lastGeneralCheckStartedAt(
  db: NodePgDatabase,
  userId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: max(checkRuns.startedAt) })
    .from(checkRuns)
    .where(eq(checkRuns.userId, userId));

  return row?.startedAt ?? null;
}
