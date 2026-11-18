import { Card } from "@heroui/react";

import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";

import { CheckNowButton } from "./check-now-button";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { EditCompanyDialog } from "./edit-company-dialog";
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
}

/**
 * Один рядок списку компаній.
 *
 * Поля, даних для яких ще немає (кількість вакансій, статус перевірки), тут не
 * показуються: вони приходять із задачами 3.04 і 4.01, а порожнє «0 вакансій»
 * ввело б в оману. Час останньої перевірки зʼявляється після першого Check now.
 */
export function CompanyCard({
  company,
  tab,
  statusLabel,
  noSourcesLabel,
  platformLabels,
  onSaved,
  onDeleted,
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
                <span className="font-medium">
                  {platformLabels[source.platform]}
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
              </li>
            ))}
          </ul>
        )}
      </Card.Content>

      {/* Дії картки. Mark all as read і Mark all as unread приходять із задачею
          3.18 (docs/ui.md, розділ 4.2). */}
      <Card.Footer className="flex flex-wrap items-center justify-between gap-2">
        {/* Ліворуч - статус на Not tracked або час останньої перевірки на
            Tracked: на Not tracked перевіряти нічого. */}
        {statusLabel !== undefined ? (
          <span className="text-sm text-muted">{statusLabel}</span>
        ) : company.lastCheckedAt === null ? (
          <span />
        ) : (
          <LastChecked at={company.lastCheckedAt} />
        )}
        <div className="flex items-center gap-2">
          {tab === "tracked" ? (
            <CheckNowButton
              companyId={company.id}
              tab={tab}
              onChecked={onSaved}
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
