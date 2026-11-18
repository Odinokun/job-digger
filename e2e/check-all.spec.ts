import { expect, type Page, test } from "@playwright/test";

import { resetDatabase } from "./database.ts";

/**
 * Головний сценарій етапу 4 (задача 4.11): Check all від запуску до підсумку.
 *
 * Критерій готовності етапу: написаний на його початку й червоний, поки етап
 * не зроблено, тому з тегом `@pending`. Тег знімає остання задача етапу.
 *
 * Три компанії на фейковому вебсервері (src/server/http/testing/README.md):
 * дві читаються, третя - дошка Greenhouse, якої на сервері немає, тож її
 * джерело падає з 404. Справжні сайти не викликаються.
 */

const LEVER = { url: "jobs.lever.co/leverdemo", name: "Lever Demo", jobs: 10 };
const PEOPLEFORCE = {
  url: "team.peopleforce.io/careers",
  name: "PeopleForce",
  jobs: 6,
};
const BROKEN = { url: "job-boards.greenhouse.io/ghost", name: "Ghost" };

const SOURCES = 3;
const NEW_VACANCIES = LEVER.jobs + PEOPLEFORCE.jobs;

// Check all рахує всі компанії на Tracked: чужі зіпсували б числа.
test.beforeAll(resetDatabase);

async function addCompany(
  page: Page,
  company: { url: string; name: string },
): Promise<void> {
  await page.getByRole("button", { name: "Add company" }).click();
  const dialog = page.getByRole("dialog", { name: "Add company" });

  await dialog.getByLabel("Company website").fill(company.url);
  // Підказка розкладає адресу на поля, коли поле втрачає фокус; назву потім
  // ставимо свою, щоб не залежати від того, що підказка з неї зробить.
  await dialog.getByLabel("Company website").blur();
  await dialog.getByLabel("Company name").fill(company.name);

  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test("Check all checks every tracked source and reports the failed one @pending", async ({
  page,
}) => {
  // Типових 30 с замало: три додавання, сама перевірка і опитування раз на
  // кілька секунд, поки підсумок не спливе.
  test.setTimeout(60_000);

  await page.goto("/companies");
  for (const company of [LEVER, PEOPLEFORCE, BROKEN]) {
    await addCompany(page, company);
  }

  // Усі три - на Tracked: джерело Ghost відстежується, хоч і зламане.
  const tracked = page
    .getByRole("navigation", { name: "Company lists" })
    .getByRole("link", { name: /^Tracked/ });
  await tracked.click();
  await expect(tracked).toContainText("3");

  // Запуск. Індикатор зʼявляється одразу з відповіді на Check all, а не з
  // першого опитування, тож його видно, хоч фейковий сервер відповідає миттєво.
  await page.getByRole("button", { name: "Check all" }).click();
  await expect(
    page.getByRole("banner").getByText(new RegExp(`Checking \\d+/${SOURCES}`)),
  ).toBeVisible();

  // Підсумок спливає сам, без перезавантаження сторінки.
  const summary = page.getByRole("alert").filter({ hasText: "Check finished" });
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await expect(summary).toContainText(`${SOURCES} sources checked`);
  await expect(summary).toContainText(`${SOURCES - 1} ok`);
  await expect(summary).toContainText("1 failed");
  await expect(summary).toContainText(`${NEW_VACANCIES} new`);
  await expect(summary).toContainText("0 removed");
  await expect(page.getByRole("banner").getByText(/Checking/)).toBeHidden();

  // Нові вакансії вже в лічильнику біля Jobs - його оновило опитування.
  const jobsLink = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: /^Jobs/ });
  await expect(jobsLink).toContainText(`(${NEW_VACANCIES})`);

  // Невдале джерело - у Failed Sources Drawer, і лише воно.
  await summary.getByRole("button", { name: "Show failed sources" }).click();
  const drawer = page.getByRole("dialog", { name: "Failed sources" });
  await expect(drawer.getByRole("listitem")).toHaveCount(1);
  const failed = drawer.getByRole("listitem").filter({ hasText: BROKEN.name });
  await expect(failed).toContainText(BROKEN.url);

  // Retry: дошки так і немає, тож джерело знову падає й лишається в списку,
  // а drawer не закривається.
  await failed.getByRole("button", { name: "Retry" }).click();
  await expect(drawer.getByRole("listitem")).toHaveCount(1);
  await expect(failed).toContainText(BROKEN.url);
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // History: один рядок на загальну перевірку. Retry його не міняє і
  // нового не додає.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "History" })
    .click();
  const runs = page.getByRole("table", { name: "Check history" });
  const rows = runs.getByRole("rowgroup").last().getByRole("row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole("cell").nth(1)).toHaveText(
    String(SOURCES),
  );
  await expect(rows.first().getByRole("cell").nth(2)).toHaveText(
    String(NEW_VACANCIES),
  );
  await expect(rows.first().getByRole("cell").nth(3)).toHaveText("0");
});
