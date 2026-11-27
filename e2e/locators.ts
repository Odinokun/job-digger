import type { Locator, Page } from "@playwright/test";

/** A company card in the list - a list item with exactly this name. */
export function companyCard(page: Page, name: string): Locator {
  // `exact`, because the name also appears in the source address (`bosch.com/...`).
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

/** A vacancy row - a list item whose name is a link to the original. */
export function vacancyRow(page: Page, title: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
}
