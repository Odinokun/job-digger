"use client";

import { Bars } from "@gravity-ui/icons";
import { Drawer } from "@heroui/react";
import { useState } from "react";

import { IconButton } from "./icon-button";
import { NavLink, type NavLinkProps } from "./nav-link";

interface MobileNavProps {
  /** Підпис кнопки й заголовок панелі. */
  label: string;
  /** Ті самі пункти, що в меню шапки. */
  items: Array<Omit<NavLinkProps, "layout" | "onNavigate">>;
}

/**
 * Меню на вузькому екрані (аудит інтерфейсу, A1, рішення автора 21.11.2026):
 * чотири розділи з лічильниками не вміщуються в шапку на 390 px і розпирали
 * сторінку вбік. Кнопка-бургер відкриває панель зі списком розділів; перехід
 * закриває панель. Від ширини `md` - звичайне меню в шапці (`app-header.tsx`).
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
