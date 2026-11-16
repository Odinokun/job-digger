"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Екран замість сторінки, рендер якої впав.
 *
 * Пропи задані руками: для `error.tsx` Next генерованого типу не дає, а в
 * документації встановленої версії вони саме такі -
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 * Проп називається `retry`, а не `reset`, як було до Next 16.
 */
type AppErrorProps = {
  error: unknown;
  retry: () => void;
};

/**
 * Межа помилок рівня застосунку: ловить падіння будь-якої сторінки.
 *
 * Типовий випадок тут - непіднята база: сторінка читає її в серверному
 * компоненті, і без цього екрана користувач побачив би порожнечу. Причину не
 * показуємо: з серверного компонента текст помилки сюди й не доходить
 * (лишається тільки `digest`), а сам збій однаково не в руках користувача -
 * лишається повторити.
 *
 * Сам root layout ця межа не покриває: `error.tsx` обгортає сторінки й вкладені
 * layout, але не той, у якому живе. Для нього потрібен був би
 * `global-error.tsx`; свідомо не додаємо, бо layout до бази не звертається -
 * лише читає локаль із cookie.
 */
export default function AppError({ error, retry }: AppErrorProps) {
  const t = useTranslations("ErrorScreen");

  useEffect(() => {
    // Лог англійською: технічне повідомлення, не текст інтерфейсу.
    console.error("Page render failed", error);
  }, [error]);

  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-xl font-semibold">{t("title")}</h2>
      <p className="mt-2 text-muted">{t("text")}</p>
      <Button className="mt-6" onPress={() => retry()}>
        {t("retry")}
      </Button>
    </section>
  );
}
