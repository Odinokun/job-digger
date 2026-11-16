import { Card } from "@heroui/react";

import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";

import { EditCompanyDialog } from "./edit-company-dialog";

interface CompanyCardProps {
  company: CompanyListItem;
  /** Вкладка списку: модалка Edit повертає рядок саме для неї. */
  tab: CompaniesTab;
  /** Підпис статусу - лише там, де він щось означає, тобто на вкладці Not tracked. */
  statusLabel?: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
}

/**
 * Один рядок списку компаній.
 *
 * Поля, даних для яких ще немає (кількість вакансій, час останньої перевірки,
 * статус перевірки), тут не показуються: вони приходять із задачами 3.04 і 4.01,
 * а порожнє «0 вакансій» ввело б в оману.
 */
export function CompanyCard({
  company,
  tab,
  statusLabel,
  noSourcesLabel,
  platformLabels,
  onSaved,
}: CompanyCardProps) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{company.name}</Card.Title>
        <Card.Description>
          {/* Зовнішнє посилання: rel обовʼязковий (docs/security.md). */}
          <a
            href={company.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {company.url}
          </a>
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

      {/* Дії картки. Поки лише Edit: Check now, Mark all as read і Delete
          приходять із задачами 2.06 і 4.01 (docs/ui.md, розділ 4.2). */}
      <Card.Footer className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">{statusLabel}</span>
        <EditCompanyDialog
          company={company}
          tab={tab}
          platformLabels={platformLabels}
          onSaved={onSaved}
        />
      </Card.Footer>
    </Card>
  );
}
