import { Card } from "@heroui/react";
import { useTranslations } from "next-intl";

import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";
import { knownAtsName } from "@/lib/companies/known-ats";

import { CheckNowButton } from "./check-now-button";
import { CompanyStatusChip } from "./company-status-chip";
import { CompanyReadButtons } from "./company-read-buttons";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { EditCompanyDialog } from "./edit-company-dialog";
import { FindPagesDialog } from "./find-pages-dialog";
import { LastChecked } from "./last-checked";

interface CompanyCardProps {
  company: CompanyListItem;
  /** Вкладка списку: модалка Edit повертає рядок саме для неї. */
  tab: CompaniesTab;
  /** Підпис статусу - лише там, де він щось означає, тобто на вкладці Not tracked. */
  statusLabel?: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
  onDeleted: (companyId: string) => void;
  /** Щойно додана: Check now стартує сам (задача 5.09). */
  startsCheck?: boolean;
}

/**
 * Один рядок списку компаній.
 *
 * Статус перевірки й час останньої перевірки зʼявляються після першої
 * перевірки: до неї показувати нічого, а порожнє «0 вакансій» ввело б в оману.
 */
export function CompanyCard({
  company,
  tab,
  statusLabel,
  noSourcesLabel,
  platformLabels,
  onSaved,
  onDeleted,
  startsCheck = false,
}: CompanyCardProps) {
  return (
    // `h-full` - те, що робить картки в рядку однаковими: елемент сітки
    // розтягується сам, а от картка всередині лишається заввишки свого вмісту.
    // Без цього низ картки з одним джерелом висить посеред рядка, поки сусідня
    // з чотирма джерелами стоїть на повну висоту. Решту робить сам HeroUI:
    // `.card` - колонка flex, `.card__content` - `flex: 1`, тому вільне місце
    // дістається саме вмісту, а підвал зі статусом і кнопками йде донизу.
    <Card className="h-full">
      <Card.Header>
        {/* Назва компанії набрана шрифтом заголовків, а не тіла: у темі «Ink»
            це єдине, що відрізняє дані від підписів інтерфейсу. */}
        <Card.Title className="font-display text-lg font-semibold tracking-tight">
          {company.name}
        </Card.Title>
        <Card.Description>
          {/* Головного сайту може не бути: компанію, знайдену лише на ATS, не
              змушуємо його вигадувати (картка 2.17). Тоді рядок просто
              порожній, а що саме показувати замість нього - крок UI. */}
          {company.url === null ? null : (
            /* Зовнішнє посилання: rel обовʼязковий (docs/security.md). */
            <a
              href={company.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {company.url}
            </a>
          )}
        </Card.Description>
      </Card.Header>

      <Card.Content>
        {company.sources.length === 0 ? (
          <p className="text-sm text-muted">{noSourcesLabel}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {company.sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-baseline gap-2"
              >
                {/* Відома ATS без парсера - її назва замість «Unsupported»
                    (задача 5.15): так видно, які парсери потрібні. */}
                <span className="font-medium">
                  {knownAtsName(source.url) ?? platformLabels[source.platform]}
                </span>
                {/* Підпис стоїть перед адресою, бо саме він розрізняє джерела
                    одного сайту: три фільтри mozilla.org відрізняються лише
                    `query` в кінці довгого рядка (картка 2.16). Сама адреса
                    лишається повною - вона єдина правда про те, що
                    перевіряється. */}
                {source.label === null ? null : <span>{source.label}</span>}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted underline underline-offset-2"
                >
                  {source.url}
                </a>
                {/* Після збою вакансії джерела не видаляються, і без дати
                    останнього успіху мертві виглядали б як живі
                    (docs/ui.md, розділ 4.2). */}
                {source.isTracked && source.lastCheck === "failed" ? (
                  source.lastSuccessAt === null ? (
                    <NeverOk />
                  ) : (
                    <LastChecked at={source.lastSuccessAt} message="lastOk" />
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card.Content>

      {/* Дії картки (docs/ui.md, розділ 4.2). */}
      <Card.Footer className="flex flex-wrap items-center justify-between gap-2">
        {/* Ліворуч - статус на Not tracked або час останньої перевірки на
            Tracked: на Not tracked перевіряти нічого. */}
        {statusLabel !== undefined ? (
          <span className="text-sm text-muted">{statusLabel}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <CompanyStatusChip sources={company.sources} />
            {company.lastCheckedAt === null ? null : (
              <LastChecked at={company.lastCheckedAt} />
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {tab === "tracked" ? (
            <CheckNowButton
              companyId={company.id}
              tab={tab}
              onChecked={onSaved}
              startsOnMount={startsCheck}
            />
          ) : (
            // На Not tracked перевіряти нічого - замість Check now пошук
            // сторінок для цієї компанії (docs/ui.md, розділ 4.3).
            <FindPagesDialog
              company={company}
              tab={tab}
              platformLabels={platformLabels}
              onSaved={onSaved}
            />
          )}
          {/* Mark all as read / unread - лише коли є що позначати. */}
          {company.vacancies.total > 0 ? (
            <CompanyReadButtons
              companyId={company.id}
              companyName={company.name}
            />
          ) : null}
          <EditCompanyDialog
            company={company}
            tab={tab}
            platformLabels={platformLabels}
            onSaved={onSaved}
          />
          <DeleteCompanyDialog company={company} onDeleted={onDeleted} />
        </div>
      </Card.Footer>
    </Card>
  );
}

/** Невдале джерело, яке ще жодного разу не перевірилося успішно. */
function NeverOk() {
  const t = useTranslations("CompaniesPage");

  return <span className="text-sm text-danger">{t("neverOk")}</span>;
}
