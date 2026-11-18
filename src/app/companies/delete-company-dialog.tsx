"use client";

import { TrashBin } from "@gravity-ui/icons";
import { AlertDialog, Button, useOverlayState } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useTransition } from "react";

import { useActionFailedToast } from "@/app/components/use-action-failed-toast";
import type { CompanyListItem } from "@/lib/companies/company-list";

import { deleteCompanyAction } from "./actions";
import { DELETE_COMPANY_INITIAL_STATE } from "./form-state";

interface DeleteCompanyDialogProps {
  company: CompanyListItem;
  /** Компанії більше немає: список прибирає її рядок зі себе. */
  onDeleted: (companyId: string) => void;
}

/**
 * Кошик у картці компанії й діалог підтвердження до нього.
 *
 * Підтвердження обовʼязкове, бо скасувати видалення нічим: разом із компанією
 * зникають її джерела, а згодом і вакансії, зокрема вибрані в Favorites
 * (docs/ui.md, розділ 4.2).
 *
 * Саме `AlertDialog`, а не `Modal`: це вікно вимагає рішення, і HeroUI дає
 * йому `role="alertdialog"` разом зі статусною іконкою. Модалки Add і Edit -
 * звичайні форми, тому в них `Modal`.
 *
 * Діалог називає, що саме зникне: компанію, кількість її карʼєрних сторінок і,
 * якщо вони є, вакансій - разом із тими, що в Favorites. Числа приходять зі
 * списку компаній (`company.vacancies`), окремого запиту на відкриття немає.
 */
export function DeleteCompanyDialog({
  company,
  onDeleted,
}: DeleteCompanyDialogProps) {
  const t = useTranslations("CompaniesPage.deleteCompany");
  const showActionFailed = useActionFailedToast();
  const overlay = useOverlayState();
  const [state, submit, isPending] = useActionState(
    deleteCompanyAction,
    DELETE_COMPANY_INITIAL_STATE,
  );
  const [, startSubmit] = useTransition();

  // Те саме, що в модалці Edit: закриття взяте окремою змінною, бо
  // `useOverlayState` повертає новий обʼєкт на кожен рендер.
  const closeDialog = overlay.close;

  useEffect(() => {
    // `not-found` тут не помилка, а той самий результат: компанії вже немає -
    // її видалили в іншій вкладці, поки діалог був відкритий. Користувач хотів
    // саме цього, тому рядок прибирається так само, без окремого тексту.
    if (
      state.status === "deleted" ||
      (state.status === "failed" && state.result.problem === "not-found")
    ) {
      onDeleted(company.id);
      closeDialog();
    }
  }, [state, closeDialog, onDeleted, company.id]);

  useEffect(() => {
    if (state.status === "failed-unexpectedly") {
      showActionFailed();
    }
  }, [state, showActionFailed]);

  return (
    <>
      {/* Кнопка лише з іконкою, тому `aria-label` обовʼязковий: без нього
          кнопка не має доступної назви. Розмір іконки задає сам `Button`
          (документація HeroUI, Button - Icon Only). */}
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        aria-label={t("open")}
        onPress={overlay.open}
      >
        <TrashBin />
      </Button>

      <AlertDialog.Backdrop
        isOpen={overlay.isOpen}
        onOpenChange={overlay.setOpen}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog className="sm:max-w-100">
            <AlertDialog.CloseTrigger />
            <AlertDialog.Header>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Heading>{t("title")}</AlertDialog.Heading>
            </AlertDialog.Header>

            {/* Форма надсилається вручну, як і в решті модалок: React після
                дії робить формі `reset`, і React Aria повідомляє про зміну
                полів. Тут полів немає, але патерн лишається спільним.

                Кнопка підтвердження не має `slot="close"`, хоч приклади HeroUI
                його й ставлять: вікно має закрити успіх дії, а не натискання,
                інакше збій лишився б непоказаним. */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const fieldsToSend = new FormData(event.currentTarget);

                startSubmit(() => submit(fieldsToSend));
              }}
            >
              <input type="hidden" name="companyId" value={company.id} />

              <AlertDialog.Body>
                <p>
                  {t("warning", {
                    name: company.name,
                    count: company.sources.length,
                  })}
                </p>
                {company.vacancies.total === 0 ? null : (
                  <p>{t("vacancies", company.vacancies)}</p>
                )}
              </AlertDialog.Body>

              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary" type="button">
                  {t("cancel")}
                </Button>
                <Button variant="danger" type="submit" isPending={isPending}>
                  {t("confirm")}
                </Button>
              </AlertDialog.Footer>
            </form>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </>
  );
}
