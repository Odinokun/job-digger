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

  // An empty tab explains why: if there are no vacancies at all, there is
  // nowhere to look for them yet, and the text leads to Companies; otherwise it
  // is just this tab that is empty.
  const emptyByTab: Record<JobsTab, string> = {
    unread: t("emptyUnread"),
    read: t("emptyRead"),
    favorites: t("emptyFavorites"),
    all: t("emptyAll"),
  };

  return (
    <JobsBoard
      // The key is the tab: the shown rows of one tab must not leak into another.
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
