import { getTranslations } from "next-intl/server";

import {
  parseCompaniesTab,
  type CompanySource,
  type DiscoveryStatus,
} from "@/lib/companies/company-list";
import { countCompaniesByTab, listCompanies } from "@/server/companies/list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { AddCompanyDialog } from "./add-company-dialog";
import { CompaniesList } from "./companies-list";
import { CompaniesTabs } from "./companies-tabs";

export default async function CompaniesPage({
  searchParams,
}: PageProps<"/companies">) {
  const t = await getTranslations("CompaniesPage");
  const tab = parseCompaniesTab((await searchParams).tab);

  const db = getDb();
  const user = await getSystemUser(db);
  const [{ items: companies, nextCursor }, counts] = await Promise.all([
    listCompanies(db, { userId: user.id, tab }),
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
    schema_org: t("platforms.schemaOrg"),
    unsupported: t("platforms.unsupported"),
  };

  const statusLabels: Record<DiscoveryStatus, string> = {
    not_checked: t("statuses.notChecked"),
    not_found: t("statuses.notFound"),
    unsupported: t("statuses.unsupported"),
    check_failed: t("statuses.checkFailed"),
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-sans text-2xl font-bold">{t("title")}</h1>
        {/* Кнопка Add живе на сторінці Companies, поруч зі списком
            (docs/ui.md, розділ 4.2). */}
        <AddCompanyDialog />
      </div>

      <div className="mt-4">
        <CompaniesTabs
          current={tab}
          label={t("tabsLabel")}
          counts={counts}
          labels={{ tracked: t("tracked"), notTracked: t("notTracked") }}
        />
      </div>

      {/* Сам список клієнтський: Load more додає порції до показаних. */}
      <CompaniesList
        tab={tab}
        initialItems={companies}
        initialCursor={nextCursor}
        emptyLabel={
          tab === "tracked" ? t("emptyTracked") : t("emptyNotTracked")
        }
        loadMoreLabel={t("loadMore")}
        noSourcesLabel={t("noSources")}
        platformLabels={platformLabels}
        statusLabels={statusLabels}
      />
    </>
  );
}
