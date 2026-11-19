"use client";

import { Button, Tooltip, type ButtonProps } from "@heroui/react";
import type { ReactNode } from "react";

/**
 * Скільки чекати перед підказкою. Типова затримка React Aria - 1,5 с, і
 * підказку легко не дочекатися; документація HeroUI у прикладах ставить 0.
 * 300 мс - щоб підказки не мерехтіли, поки курсор лише проходить повз.
 */
export const TOOLTIP_DELAY_MS = 300;

interface WithTooltipProps {
  /** Текст підказки - назва дії. */
  label: string;
  /** Одна кнопка (компонент React Aria), над якою зʼявиться підказка. */
  children: ReactNode;
}

/**
 * Підказка при наведенні й фокусі на кнопку. Правило застосунку: кожна кнопка
 * лише з іконкою має підказку - одного `aria-label` мало, бо зрячий користувач
 * його не бачить (src/app/README.md, «Кнопки лише з іконкою»).
 *
 * Для звичайної кнопки-іконки - `IconButton`; цей компонент - для кнопок, які
 * HeroUI малює сам, як хрестик `CloseTrigger` у діалогах.
 */
export function WithTooltip({ label, children }: WithTooltipProps) {
  return (
    <Tooltip delay={TOOLTIP_DELAY_MS}>
      {children}
      <Tooltip.Content>
        <p>{label}</p>
      </Tooltip.Content>
    </Tooltip>
  );
}

type IconButtonProps = Omit<
  ButtonProps,
  "isIconOnly" | "aria-label" | "children"
> & {
  /** Назва дії: і `aria-label`, і текст підказки - розійтися вони не можуть. */
  label: string;
  /** Сама іконка. */
  children: ReactNode;
};

/**
 * Кнопка лише з іконкою: `isIconOnly`, доступна назва і підказка при
 * наведенні з тим самим текстом (документація HeroUI, Tooltip - Usage).
 */
export function IconButton({ label, children, ...props }: IconButtonProps) {
  return (
    <WithTooltip label={label}>
      <Button {...props} isIconOnly aria-label={label}>
        {children}
      </Button>
    </WithTooltip>
  );
}
