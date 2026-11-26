import { getTranslations } from "next-intl/server";

import { parseJobsTab, type JobsTab } from "@/lib/vacancies/vacancy-list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";
import {
  countVacanciesByTab,
  hasAnyVacancy,
  listVacancies,
} from "@/server/vacancies/list";

import { JobsBoard } from "./_jobs/jobs-board";

export default async function JobsPage({ searchParams }: PageProps<"/">) {
  const t = await getTranslations("JobsPage");
  const tab = parseJobsTab((await searchParams).tab);

  const db = getDb();
  const user = await getSystemUser(db);
  const [{ items, nextCursor }, hasAny, counts] = await Promise.all([
    listVacancies(db, { userId: user.id, tab }),
    hasAnyVacancy(db, user.id),
    countVacanciesByTab(db, user.id),
  ]);

  // Порожня вкладка пояснює причину: якщо вакансій
  // немає зовсім - їх ще ніде шукати, і текст веде в Companies; інакше
  // порожня саме ця вкладка.
  const emptyByTab: Record<JobsTab, string> = {
    unread: t("emptyUnread"),
    read: t("emptyRead"),
    favorites: t("emptyFavorites"),
    all: t("emptyAll"),
  };

  return (
    <JobsBoard
      // Ключ - вкладка: показані рядки однієї не мають перетікати в іншу.
      key={tab}
      tab={tab}
      title={t("title")}
      tabsLabel={t("tabsLabel")}
      tabLabels={{
        unread: t("unread"),
        read: t("read"),
        favorites: t("favorites"),
        all: t("all"),
      }}
      counts={counts}
      initialItems={items}
      initialCursor={nextCursor}
      emptyLabel={hasAny ? emptyByTab[tab] : t("emptyNoVacancies")}
      addCompanyLabel={hasAny ? null : t("addCompany")}
      loadMoreLabel={t("loadMore")}
      favoriteGroupLabels={{
        recent: t("recentFavorites"),
        earlier: t("earlierFavorites"),
      }}
    />
  );
}
