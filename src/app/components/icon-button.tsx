"use client";

import { Button, Tooltip, type ButtonProps } from "@heroui/react";
import type { ReactNode } from "react";

/**
 * How long to wait before the tooltip. React Aria's default delay is 1.5 s, and
 * it is easy to give up waiting; the HeroUI docs examples use 0. 300 ms keeps
 * tooltips from flickering while the pointer merely passes by.
 */
export const TOOLTIP_DELAY_MS = 300;

interface WithTooltipProps {
  /** The tooltip text - the name of the action. */
  label: string;
  /** One button (a React Aria component) the tooltip appears over. */
  children: ReactNode;
}

/**
 * A tooltip on hover and focus of a button. App rule: every icon-only button has
 * a tooltip - an `aria-label` alone is not enough, because a sighted user does
 * not see it (src/app/README.md, "Icon-only buttons").
 *
 * For a regular icon button use `IconButton`; this component is for buttons
 * HeroUI draws itself, like the `CloseTrigger` cross in dialogs.
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
  /** The action name: both the `aria-label` and the tooltip text - they cannot drift apart. */
  label: string;
  /** The icon itself. */
  children: ReactNode;
};

/**
 * An icon-only button: `isIconOnly`, an accessible name and a tooltip on hover
 * with the same text (HeroUI docs, Tooltip - Usage).
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
