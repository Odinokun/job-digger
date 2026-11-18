import type { Locator, Page } from "@playwright/test";

/** Картка компанії в списку - елемент списку з точно такою назвою. */
export function companyCard(page: Page, name: string): Locator {
  // `exact`, бо назва трапляється й в адресі джерела (`bosch.com/...`).
  return page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) });
}

/** Рядок вакансії - елемент списку, назва якого є посиланням на оригінал. */
export function vacancyRow(page: Page, title: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: title, exact: true }) });
}
