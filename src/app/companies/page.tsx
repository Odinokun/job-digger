import { getTranslations } from "next-intl/server";

import {
  parseCompaniesTab,
  type CompanySource,
  type DiscoveryStatus,
} from "@/lib/companies/company-list";
import { countCompaniesByTab, listCompanies } from "@/server/companies/list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { CompaniesBoard } from "./companies-board";
import { CompaniesTabs } from "./companies-tabs";

const EMPTY_LABELS = {
  tracked: "emptyTracked",
  "not-tracked": "emptyNotTracked",
  attention: "emptyAttention",
  all: "emptyAll",
} as const;

export default async function CompaniesPage({
  searchParams,
}: PageProps<"/companies">) {
  const t = await getTranslations("CompaniesPage");
  const params = await searchParams;
  const tab = parseCompaniesTab(params.tab);
  // Пошук - лише на вкладці All; `q` в адресі іншої вкладки ігнорується.
  const query = tab === "all" && typeof params.q === "string" ? params.q : "";

  const db = getDb();
  const user = await getSystemUser(db);
  const [{ items: companies, nextCursor }, counts] = await Promise.all([
    listCompanies(db, { userId: user.id, tab, query }),
    countCompaniesByTab(db, user.id),
  ]);

  // Записані явно, а не зібрані циклом: тоді нова платформа в схемі одразу
  // ламає типи тут, замість тихо показати порожній підпис.
  const platformLabels: Record<CompanySource["platform"], string> = {
    greenhouse: t("platforms.greenhouse"),
    lever: t("platforms.lever"),
    ashby: t("platforms.ashby"),
    workday: t("platforms.workday"),
    peopleforce: t("platforms.peopleforce"),
    breezy: t("platforms.breezy"),
    cleverstaff: t("platforms.cleverstaff"),
    hurma: t("platforms.hurma"),
    personio: t("platforms.personio"),
    softgarden: t("platforms.softgarden"),
    workable: t("platforms.workable"),
    bamboohr: t("platforms.bamboohr"),
    pinpoint: t("platforms.pinpoint"),
    talentadore: t("platforms.talentadore"),
    schema_org: t("platforms.schemaOrg"),
    own_page: t("platforms.ownPage"),
    unsupported: t("platforms.unsupported"),
  };

  const statusLabels: Record<DiscoveryStatus, string> = {
    not_checked: t("statuses.notChecked"),
    not_found: t("statuses.notFound"),
    unsupported: t("statuses.unsupported"),
    check_failed: t("statuses.checkFailed"),
    possible_page: t("statuses.possiblePage"),
  };

  return (
    <CompaniesBoard
      // Ключ - вкладка: показані рядки однієї не мають перетікати в іншу.
      key={tab}
      tab={tab}
      title={t("title")}
      tabs={
        <CompaniesTabs
          current={tab}
          label={t("tabsLabel")}
          counts={counts}
          labels={{
            tracked: t("tracked"),
            notTracked: t("notTracked"),
            attention: t("attention"),
            all: t("all"),
          }}
        />
      }
      initialItems={companies}
      initialCursor={nextCursor}
      // Порожній результат пошуку пояснює, що саме не знайшлося, а не каже
      // «компаній поки немає».
      emptyLabel={
        query.trim() === ""
          ? t(EMPTY_LABELS[tab])
          : t("emptySearch", { query: query.trim() })
      }
      loadMoreLabel={t("loadMore")}
      noSourcesLabel={t("noSources")}
      platformLabels={platformLabels}
      statusLabels={statusLabels}
      hasTracked={counts.tracked > 0}
      hasNotTracked={counts.notTracked > 0}
      query={query}
      searchLabels={{
        open: t("search"),
        field: t("searchLabel"),
        close: t("closeSearch"),
      }}
    />
  );
}
