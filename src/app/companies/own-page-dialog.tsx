"use client";

import {
  Button,
  Description,
  Modal,
  Radio,
  RadioGroup,
  Spinner,
  useOverlayState,
} from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { WithTooltip } from "@/app/components/icon-button";
import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type {
  CompaniesTab,
  CompanyListItem,
  CompanySource,
} from "@/lib/companies/company-list";
import type { LinkGroup } from "@/server/parsers/own-page";

import { applyOwnPageRecipeAction, previewOwnPageAction } from "./actions";

interface OwnPageDialogProps {
  companyId: string;
  source: CompanySource;
  tab: CompaniesTab;
  /**
   * Рецепт записано: рядок компанії для вкладки (або `null`) і запуск першої
   * перевірки - той самий шлях, що після Add company (`addRow` дошки).
   */
  onApplied: (company: CompanyListItem | null, companyId: string) => void;
}

/** Скільки назв групи видно в діалозі: решта - «і ще N». */
const TITLES_SHOWN = 4;

/**
 * Read as list у рядку власної сторінки компанії (задача 6.21): діалог
 * завантажує сторінку й пропонує до трьох груп посилань, що повторюються,
 * найімовірнішу - вибраною. Людина підтверджує, які посилання - вакансії, і
 * префікс їхніх адрес стає рецептом сторінки. Для сторінки, яку вже читаємо
 * (`own_page`), та сама кнопка міняє рецепт - якщо сайт переробили.
 *
 * Видно саме те, що віддав сервер сайту: фільтр після `#` чи в JavaScript він
 * ігнорує, і це одразу помітно за назвами.
 */
export function OwnPageDialog({
  companyId,
  source,
  tab,
  onApplied,
}: OwnPageDialogProps) {
  const t = useTranslations("CompaniesPage.ownPage");
  const tCommon = useTranslations("Common");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [groups, setGroups] = useState<LinkGroup[] | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [problem, setProblem] = useState<"page-unavailable" | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  function openDialog() {
    setGroups(null);
    setPrefix(null);
    setProblem(null);
    overlay.open();

    startLoading(async () => {
      const result = await previewOwnPageAction(source.id);

      if (result.ok) {
        setGroups(result.groups);
        setPrefix(result.groups[0]?.prefix ?? null);
      } else if (result.problem === "page-unavailable") {
        setProblem("page-unavailable");
      } else {
        // Джерела вже немає чи його прочитав парсер - список застарів.
        overlay.close();
        showActionFailed();
      }
    });
  }

  function apply() {
    if (prefix === null) return;

    startSaving(async () => {
      const result = await applyOwnPageRecipeAction(
        companyId,
        source.id,
        prefix,
        tab,
      );

      if (!result.ok) {
        showActionFailed();
        return;
      }

      overlay.close();
      onApplied(result.company, companyId);
    });
  }

  return (
    <>
      <Button size="sm" variant="tertiary" onPress={openDialog}>
        {source.platform === "own_page" ? t("change") : t("open")}
      </Button>

      <Modal.Backdrop isOpen={overlay.isOpen} onOpenChange={overlay.setOpen}>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <WithTooltip label={tCommon("close")}>
              <Modal.CloseTrigger aria-label={tCommon("close")} />
            </WithTooltip>
            <Modal.Header>
              <Modal.Heading>{t("title")}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              <p className="font-mono text-sm break-all text-muted">
                {source.url}
              </p>
              {isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner color="current" size="sm" />
                  {t("loading")}
                </p>
              ) : problem === "page-unavailable" ? (
                <p role="alert" className="text-sm text-danger">
                  {t("unavailable")}
                </p>
              ) : groups === null ? null : groups.length === 0 ? (
                <p className="text-sm text-muted">{t("nothing")}</p>
              ) : (
                <RadioGroup
                  aria-label={t("choose")}
                  value={prefix}
                  onChange={setPrefix}
                >
                  <p className="text-sm text-muted">{t("choose")}</p>
                  {groups.map((group) => (
                    <Radio key={group.prefix} value={group.prefix}>
                      <Radio.Content>
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        {t("links", { count: group.vacancies.length })}
                      </Radio.Content>
                      <Description>
                        {/* Назви - текст із чужого сайту, лише як текст. */}
                        {group.vacancies
                          .slice(0, TITLES_SHOWN)
                          .map((vacancy) => vacancy.title)
                          .join(" · ")}
                        {group.vacancies.length > TITLES_SHOWN
                          ? ` ${t("more", { count: group.vacancies.length - TITLES_SHOWN })}`
                          : null}
                      </Description>
                    </Radio>
                  ))}
                </RadioGroup>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="secondary" slot="close">
                {t("cancel")}
              </Button>
              <Button
                isDisabled={prefix === null}
                isPending={isSaving}
                onPress={apply}
              >
                {t("confirm")}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
