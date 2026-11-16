import { getTranslations } from "next-intl/server";

import {
  parseCompaniesTab,
  type CompanyListItem,
  type CompanySource,
} from "@/lib/companies/company-list";
import { countCompaniesByTab, listCompanies } from "@/server/companies/list";
import { getDb } from "@/server/db/client";
import { getSystemUser } from "@/server/db/system-user";

import { AddCompanyDialog } from "./add-company-dialog";
import { CompaniesTabs } from "./companies-tabs";
import { CompanyCard } from "./company-card";

export default async function CompaniesPage({
  searchParams,
}: PageProps<"/companies">) {
  const t = await getTranslations("CompaniesPage");
  const tab = parseCompaniesTab((await searchParams).tab);

  const db = getDb();
  const user = await getSystemUser(db);
  const [{ items: companies }, counts] = await Promise.all([
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

  const statusLabels: Record<CompanyListItem["discoveryStatus"], string> = {
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

      {companies.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          {tab === "tracked" ? t("emptyTracked") : t("emptyNotTracked")}
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {companies.map((company) => (
            <li key={company.id}>
              <CompanyCard
                company={company}
                // Статус описує стан пошуку сторінок, тому має сенс лише там,
                // де компанія ще не відстежується (docs/ui.md, розділ 4.3).
                statusLabel={
                  tab === "not-tracked"
                    ? statusLabels[company.discoveryStatus]
                    : undefined
                }
                noSourcesLabel={t("noSources")}
                platformLabels={platformLabels}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
