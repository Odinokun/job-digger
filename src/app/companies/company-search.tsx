"use client";

import { Magnifier, Xmark } from "@gravity-ui/icons";
import { SearchField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { IconButton } from "@/app/components/icon-button";

/** Скільки чекати після останньої літери, перш ніж перечитати список. */
const TYPING_PAUSE_MS = 300;

interface CompanySearchProps {
  /** Пошук з адреси сторінки - те, що зараз показує список. */
  query: string;
  labels: { open: string; field: string; placeholder: string; close: string };
}

/** Адреса вкладки All з пошуком; порожній пошук - без параметра. */
function hrefOf(query: string): string {
  const text = query.trim();

  return text === ""
    ? "/companies?tab=all"
    : `/companies?tab=all&q=${encodeURIComponent(text)}`;
}

/**
 * Пошук компанії за назвою на вкладці All (задача companies-search): лупа
 * відкриває поле, і список фільтрується, поки людина друкує.
 *
 * Шукає сервер, а не показаний список: компаній сотні, а завантажено перші 50.
 * Пошук живе в адресі (`?tab=all&q=...`), як і вкладка, тож переживає
 * перезавантаження; `router.replace`, а не `push`, щоб кожна літера не лягала
 * в історію браузера. Список перечитується після паузи в друкуванні, а не на
 * кожну літеру.
 */
export function CompanySearch({ query, labels }: CompanySearchProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(query !== "");
  const [value, setValue] = useState(query);
  const [, startNavigation] = useTransition();

  useEffect(() => {
    if (value.trim() === query.trim()) {
      return;
    }

    const timer = setTimeout(() => {
      startNavigation(() => {
        router.replace(hrefOf(value), { scroll: false });
      });
    }, TYPING_PAUSE_MS);

    return () => clearTimeout(timer);
  }, [value, query, router]);

  function close() {
    setValue("");
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <IconButton
        size="sm"
        variant="tertiary"
        label={labels.open}
        onPress={() => setIsOpen(true)}
      >
        <Magnifier />
      </IconButton>
    );
  }

  return (
    // Поле - на всю ширину рядка поруч із хрестиком (правка автора
    // 24.11.2026).
    <div className="flex w-full items-center gap-2">
      {/* Підпис - лише для читача екрана: лупа в полі й так каже, що це
          пошук. Плейсхолдер - приклад назви з «e.g.», як велить правило 4.
          Група заввишки 32 px, як кнопка-лупа: інакше поле на 4 px вище за
          кнопку, і список під ним стрибав би, щойно пошук відкрився. */}
      <SearchField
        aria-label={labels.field}
        value={value}
        onChange={setValue}
        autoFocus
        className="min-w-0 flex-1"
      >
        <SearchField.Group className="h-8">
          <SearchField.SearchIcon />
          <SearchField.Input
            placeholder={labels.placeholder}
            className="h-full"
          />
        </SearchField.Group>
      </SearchField>
      <IconButton
        size="sm"
        variant="tertiary"
        label={labels.close}
        onPress={close}
      >
        <Xmark />
      </IconButton>
    </div>
  );
}
