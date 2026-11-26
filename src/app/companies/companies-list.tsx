"use client";

import { Button, Spinner } from "@heroui/react";

import {
  isTrackedCompany,
  type CompaniesTab,
  type CompanyListItem,
  type CompanySource,
  type DiscoveryStatus,
} from "@/lib/companies/company-list";

import { CompanyCard } from "./company-card";

interface CompaniesListProps {
  tab: CompaniesTab;
  items: CompanyListItem[];
  /** Чи є що дозавантажувати: сервер каже це курсором, список лише малює кнопку. */
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onSaved: (companyId: string, saved: CompanyListItem | null) => void;
  onDeleted: (companyId: string) => void;
  /** Власній сторінці дали рецепт (задача 6.21) - як нова компанія. */
  onRecipeApplied: (company: CompanyListItem | null, companyId: string) => void;
  /** Нова компанія, картка якої сама починає першу перевірку. */
  firstCheckId: string | null;
  emptyLabel: string;
  /** Прихований для очей заголовок над списком - назва вкладки. */
  heading: string;
  loadMoreLabel: string;
  noSourcesLabel: string;
  platformLabels: Record<CompanySource["platform"], string>;
  statusLabels: Record<DiscoveryStatus, string>;
}

/**
 * Список компаній із кнопкою Load more.
 *
 * Свого стану не має: показані рядки й курсор тримає
 * [`companies-board.tsx`](./companies-board.tsx), бо міняють їх і Add, і Edit,
 * і Load more. Тут лишилася тільки розмітка.
 */
export function CompaniesList({
  tab,
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSaved,
  onDeleted,
  onRecipeApplied,
  firstCheckId,
  emptyLabel,
  heading,
  loadMoreLabel,
  noSourcesLabel,
  platformLabels,
  statusLabels,
}: CompaniesListProps) {
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <>
      {/* Назви карток - `h3`: `Card.Title` HeroUI інший тег не рендерить. Без
          `h2` між ними й `h1` сторінки заголовки стрибали б через рівень
          (axe і Lighthouse `heading-order`), а в роторі VoiceOver список не
          мав би назви. Тому `h2` є, але лише для читача екрана. */}
      <h2 className="sr-only">{heading}</h2>
      {/* Одна колонка на будь-якій ширині (рішення автора 21.11.2026, аудит
          інтерфейсу B2): список компаній читається згори донизу, як Jobs, а
          картки поруч розтягувались до найвищої або лишали прогалини. `min-w-0`
          - щоб довга адреса обрізалась «…», а не розпирала колонку ширше за
          екран. */}
      <ul className="mt-6 grid gap-4">
        {items.map((company) => (
          <li key={company.id} className="min-w-0">
            <CompanyCard
              company={company}
              tab={tab}
              startsCheck={company.id === firstCheckId}
              // Статус описує стан пошуку сторінок, тому має сенс лише там,
              // де компанія ще не відстежується (docs/ui.md, розділ 4.3). Саме
              // компанія, а не вкладка: на Needs attention змішані обидві.
              statusLabel={
                isTrackedCompany(company.sources)
                  ? undefined
                  : statusLabels[company.discoveryStatus]
              }
              noSourcesLabel={noSourcesLabel}
              platformLabels={platformLabels}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onRecipeApplied={onRecipeApplied}
            />
          </li>
        ))}
      </ul>

      {/* Кнопки немає, коли курсора немає: сервер уже сказав, що далі нічого. */}
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          {/* Без `variant`: та сама основна кнопка, що Add company. */}
          <Button onPress={onLoadMore} isPending={isLoadingMore}>
            {/* `isPending` у HeroUI лише вимикає кнопку - спінер малюємо самі
                (документація Button, приклад Loading). */}
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : null}
                {loadMoreLabel}
              </>
            )}
          </Button>
        </div>
      ) : null}
    </>
  );
}
