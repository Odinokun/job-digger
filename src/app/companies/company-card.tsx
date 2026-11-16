import { Card } from "@heroui/react";

import type {
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";

interface CompanyCardProps {
  company: CompanyListItem;
  /** Підпис статусу - лише там, де він щось означає, тобто на вкладці Not tracked. */
  statusLabel?: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
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
  statusLabel,
  noSourcesLabel,
  platformLabels,
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

      {statusLabel ? (
        <Card.Footer>
          <span className="text-sm text-muted">{statusLabel}</span>
        </Card.Footer>
      ) : null}
    </Card>
  );
}
