"use client";

import { Bars } from "@gravity-ui/icons";
import { Drawer } from "@heroui/react";
import { useState } from "react";

import { IconButton } from "./icon-button";
import { NavLink, type NavLinkProps } from "./nav-link";

interface MobileNavProps {
  /** The button label and the panel title. */
  label: string;
  /** The same items as in the header menu. */
  items: Array<Omit<NavLinkProps, "layout" | "onNavigate">>;
}

/**
 * The menu on a narrow screen (UI audit, A1): four sections with counters do not
 * fit in the header at 390 px and pushed the page sideways. A burger button
 * opens a panel with the list of sections; following a link closes it. From the
 * `md` width there is the regular menu in the header (`app-header.tsx`).
 */
export function MobileNav({ label, items }: MobileNavProps) {
  const [isOpen, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <IconButton
        size="sm"
        variant="tertiary"
        label={label}
        onPress={() => setOpen(true)}
      >
        <Bars />
      </IconButton>
      <Drawer.Backdrop isOpen={isOpen} onOpenChange={setOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog>
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>{label}</Drawer.Heading>
            </Drawer.Header>
            <Drawer.Body>
              <nav aria-label={label} className="flex flex-col">
                {items.map((item) => (
                  <NavLink
                    key={item.href}
                    {...item}
                    layout="list"
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </nav>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  );
}
