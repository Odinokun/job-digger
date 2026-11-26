"use client";

import { Magnifier, Xmark } from "@gravity-ui/icons";
import { SearchField } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { IconButton } from "@/app/components/icon-button";

/** How long to wait after the last letter before re-reading the list. */
const TYPING_PAUSE_MS = 300;

interface CompanySearchProps {
  /** The search from the page URL - what the list shows now. */
  query: string;
  labels: { open: string; field: string; placeholder: string; close: string };
}

/** The All tab URL with the search; an empty search means no parameter. */
function hrefOf(query: string): string {
  const text = query.trim();

  return text === ""
    ? "/companies?tab=all"
    : `/companies?tab=all&q=${encodeURIComponent(text)}`;
}

/**
 * Company search by name on the All tab (task companies-search): the magnifier
 * opens the field, and the list filters while the user types.
 *
 * The server searches, not the shown list: there are hundreds of companies, and
 * only the first 50 are loaded. The search lives in the URL (`?tab=all&q=...`),
 * like the tab, so it survives a reload; `router.replace`, not `push`, so that
 * every letter does not end up in the browser history. The list is re-read after
 * a pause in typing, not on every letter.
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
    // The field spans the row next to the cross.
    <div className="flex w-full items-center gap-2">
      {/* The label is for screen readers only: the magnifier in the field
          already says it is a search. The placeholder is an example name with
          "e.g.", as rule 4 asks. The group is 32 px tall, like the magnifier
          button: otherwise the field is 4 px taller than the button, and the
          list under it would jump as soon as search opened. */}
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
