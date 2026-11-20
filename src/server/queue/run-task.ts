/**
 * Виконання захопленого завдання: перевірити джерело і записати результат, а
 * завдання пошуку (`discover`) передати `runDiscoverTask`.
 * Правила - README.md поруч, «Виконання завдання».
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { checkSource } from "../checks/check-source.ts";
import { careerSources } from "../db/schema.ts";
import type { HttpClient } from "../http/client.ts";
import type { ClaimedTask } from "./claim.ts";
import { runDiscoverTask } from "./discover-task.ts";
import { finishTask, type TaskOutcome } from "./finish.ts";

export interface RunTaskOptions {
  /** Годинник для `finished_at`. Тести підставляють сталий момент. */
  clock?: () => Date;
}

/**
 * Повертає `false`, якщо результат відкинуто (`finishTask`): джерело видалили
 * або завдання вже належить іншому обробнику.
 */
export async function runTask(
  db: NodePgDatabase,
  client: HttpClient,
  claimed: ClaimedTask,
  { clock = () => new Date() }: RunTaskOptions = {},
): Promise<boolean> {
  if (claimed.kind === "discover") {
    return runDiscoverTask(db, client, claimed, { clock });
  }

  const [source] = await db
    .select({
      id: careerSources.id,
      url: careerSources.url,
      platform: careerSources.platform,
      vacancyLinkPrefix: careerSources.vacancyLinkPrefix,
    })
    .from(careerSources)
    .where(eq(careerSources.id, claimed.sourceId));

  // Джерело видалили після захоплення - разом із ним зникло й завдання.
  if (source === undefined) return false;

  let outcome: TaskOutcome;
  try {
    // Момент перевірки - момент захоплення: від нього рахуються дата
    // виявлення нових вакансій і стан джерела.
    outcome = (await checkSource(
      db,
      client,
      source,
      claimed.lockedAt,
      claimed.readDepth,
    )) ?? {
      // Платформа без парсера: перевіряти нічого, і це не помилка - так само,
      // як у Check now.
      ok: true,
      newVacancies: 0,
      removedVacancies: 0,
      skipped: 0,
    };
  } catch (error) {
    // Помилка в нашому коді, а не на сайті: парсери повертають збої сайту
    // значенням. Завдання невдале одразу - інакше воно висіло б, доки його
    // не поверне `recoverStaleTasks`, і так тричі.
    console.error(`Check task ${claimed.id} crashed`, error);
    outcome = { ok: false, error: { reason: "crashed" } };
  }

  return finishTask(db, claimed, { now: clock(), outcome });
}
