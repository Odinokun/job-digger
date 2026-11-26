import { Card } from "@heroui/react";
import { useTranslations } from "next-intl";

import {
  isNotReadSource,
  isTrackedCompany,
  type CompaniesTab,
  type CompanyListItem,
  type CompanySource,
} from "@/lib/companies/company-list";
import { knownAtsName } from "@/lib/companies/known-ats";

import { CheckNowButton } from "./check-now-button";
import { CompanyStatusChip, NotReadChip } from "./company-status-chip";
import { CompanyReadButtons } from "./company-read-buttons";
import { DeleteCompanyDialog } from "./delete-company-dialog";
import { EditCompanyDialog } from "./edit-company-dialog";
import { FindPagesDialog } from "./find-pages-dialog";
import { LastChecked } from "./last-checked";
import { OwnPageDialog } from "./own-page-dialog";
import { ReferenceOnlyCheckbox } from "./reference-only-checkbox";

interface CompanyCardProps {
  company: CompanyListItem;
  /** Вкладка списку: модалка Edit повертає рядок саме для неї. */
  tab: CompaniesTab;
  /** Підпис статусу - лише там, де він щось означає, тобто в компанії Not tracked. */
  statusLabel?: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
  onDeleted: (companyId: string) => void;
  /**
   * Власній сторінці дали рецепт (задача 6.21): рядок для вкладки й перша
   * перевірка - як після Add company.
   */
  onRecipeApplied: (company: CompanyListItem | null, companyId: string) => void;
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
  onRecipeApplied,
  startsCheck = false,
}: CompanyCardProps) {
  return (
    <Card>
      <Card.Header>
        {/* Назва компанії набрана шрифтом заголовків, а не тіла: у темі «Ink»
            це єдине, що відрізняє дані від підписів інтерфейсу. */}
        <Card.Title className="font-display text-lg font-semibold tracking-tight">
          {company.name}
        </Card.Title>
        <Card.Description>
          {/* Зовнішнє посилання: rel обовʼязковий (CLAUDE.md, «Безпека»). */}
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
          // Між джерелами відступ більший, ніж усередині джерела: видно, де
          // закінчується одне й починається інше (аудит інтерфейсу, B1).
          <ul className="flex flex-col gap-4 text-sm">
            {company.sources.map((source) => (
              <li key={source.id} className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  {/* Відома ATS без парсера - її назва замість «Unsupported»
                      (задача 5.15): так видно, які парсери потрібні. Сторінку,
                      яку ми не читаємо, підписано кольором уваги (задача 6.11,
                      аудит A6): жовтим в обох темах, червоний - лише помилки.
                      Позначену «лише посиланням» - звичайним (задача 6.17). */}
                  <span
                    className={
                      isNotReadSource(source)
                        ? "font-medium text-attention"
                        : "font-medium"
                    }
                  >
                    {knownAtsName(source.url) ??
                      platformLabels[source.platform]}
                  </span>
                  {/* Підпис розрізняє джерела одного сайту: три фільтри
                      mozilla.org відрізняються лише `query` в кінці довгої
                      адреси (картка 2.16). */}
                  {source.label === null ? null : <span>{source.label}</span>}
                  {/* Після збою вакансії джерела не видаляються, і без дати
                      останнього успіху мертві виглядали б як живі. */}
                  {source.isTracked && source.lastCheck === "failed" ? (
                    source.lastSuccessAt === null ? (
                      <NeverOk />
                    ) : (
                      <LastChecked at={source.lastSuccessAt} message="lastOk" />
                    )
                  ) : null}
                </div>
                {/* Адреса завжди під рядком стану і в один рядок (рішення
                    автора, аудит B1): з фільтрами вона буває на чотири-п'ять
                    рядків. Повна - у підказці браузера (`title`) і в рядку
                    стану браузера при наведенні; цілком її видно в Edit. */}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.url}
                  className="truncate text-muted underline underline-offset-2"
                >
                  {source.url}
                </a>
                {/* Сторінку, яку нічим прочитати, можна читати як список за
                    рецептом (задача 6.21) або лишити посиланням (6.17);
                    власній сторінці - змінити рецепт. Дії джерела - однією
                    групою під адресою, однаково для кожного джерела. */}
                {source.platform === "unsupported" ||
                source.platform === "own_page" ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <OwnPageDialog
                      companyId={company.id}
                      source={source}
                      tab={tab}
                      onApplied={onRecipeApplied}
                    />
                    {source.platform === "unsupported" ? (
                      <ReferenceOnlyCheckbox
                        companyId={company.id}
                        source={source}
                        tab={tab}
                        onSaved={onSaved}
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card.Content>

      {/* Дії картки. */}
      <Card.Footer className="flex flex-wrap items-center justify-between gap-2">
        {/* Ліворуч - статус на Not tracked або час останньої перевірки на
            Tracked: на Not tracked перевіряти нічого. */}
        {statusLabel !== undefined ? (
          <div className="flex flex-wrap items-center gap-2">
            <NotReadChip sources={company.sources} />
            <span className="text-sm text-muted">{statusLabel}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {/* Один кольоровий бейдж на картку (аудит A6): статус перевірки
                і «не прочитано» зводить сам `CompanyStatusChip`. */}
            <CompanyStatusChip sources={company.sources} />
            {company.lastCheckedAt === null ? null : (
              <LastChecked at={company.lastCheckedAt} />
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Дії визначає компанія, а не вкладка: на Needs attention змішані
              Tracked і Not tracked (задача 6.11). */}
          {isTrackedCompany(company.sources) ? (
            <CheckNowButton
              companyId={company.id}
              tab={tab}
              onChecked={onSaved}
              startsOnMount={startsCheck}
            />
          ) : (
            // На Not tracked перевіряти нічого - замість Check now пошук
            // сторінок для цієї компанії.
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
