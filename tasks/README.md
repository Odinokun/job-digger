# Задачі

Джерело правди щодо задач проєкту: що треба зробити, що в роботі і що вже готово. Один файл - одна задача (колишня картка Trello), а **статус кожної задачі живе лише в таблиці нижче**. Дошка Trello «JD - Job Digger» лишається архівом і більше не оновлюється. Задачі, завершені до переходу, сюди не перенесені: їхні чеклісти - у Trello, а код і опис - у злитих PR.

## Статуси

- `analyze` - ідея, що виникла під час розробки, ще не продумана й не внесена в план; після обговорення переходить у `backlog`.
- `backlog` - задача з плану.
- `todo` - взята в найближчу роботу.
- `done` - зроблена.
- `cancelled` - від задачі відмовились без коду; причина - у її файлі (наприклад, правила сервісу забороняють автоматичне читання, 6.22-6.24).

Статус і чекліст змінюються в тому самому PR, що й код задачі, і `done` задача отримує останнім комітом своєї гілки. Тому в `main` таблиця завжди правдива: задача стає `done` рівно тоді, коли змерджено її PR.

Окремих статусів «в роботі» і «на перевірці» в таблиці немає: в `main` вони не потрапили б ніколи, бо туди не комітимо напряму. Задача в роботі - це її гілка, на перевірці - відкритий PR (`gh pr list`).

## Файл задачі

Назва - `N.MM-slug.md`: номер задачі і коротка суть англійською, як у назві гілки (`2.07-csv-import.md`). Задача без номера - ідея з `analyze` або робота поза етапами - називається лише `slug.md`; номер вона отримує, коли переходить в етап.

```markdown
# 2.07 Імпорт CSV

**Етап 2 — Компанії** · строго TDD

Що робимо і навіщо. Де важливий порядок - «брати перед X.YY».

PR: #57

## Кроки

- [x] Парсер рядка
- [ ] Валідація
```

Перший рядок опису називає етап з [docs/roadmap.md](../docs/roadmap.md). Рядок `PR:` зʼявляється, коли PR відкрито. Кроки записуються, коли задачу беруть у роботу.

Нова задача - новий файл і новий рядок у таблиці. Задачі з номером ідуть за номером, без номера - в кінці.

## Дошка

| Задача                                                                                           | Статус  |
| ------------------------------------------------------------------------------------------------ | ------- |
| [2.08 E2E: додавання, редагування, видалення компанії](2.08-e2e-company-crud.md)                 | done    |
| [3.01 Фейковий сервер із відповідями платформ](3.01-fake-platform-server.md)                     | done    |
| [3.02 Модуль HTTP-запитів з ввічливістю](3.02-polite-http-client.md)                             | done    |
| [3.03 Захист від SSRF](3.03-ssrf-protection.md)                                                  | done    |
| [3.04 Схема vacancies](3.04-vacancies-schema.md)                                                 | done    |
| [3.05 Очищення URL і внутрішній ключ вакансії](3.05-url-cleanup-vacancy-key.md)                  | done    |
| [3.06 Парсер Greenhouse](3.06-greenhouse-parser.md)                                              | done    |
| [3.07 Парсер Lever](3.07-lever-parser.md)                                                        | done    |
| [3.08 Парсер Ashby](3.08-ashby-parser.md)                                                        | done    |
| [3.09 Парсер Workday](3.09-workday-parser.md)                                                    | done    |
| [3.10 Парсер PeopleForce](3.10-peopleforce-parser.md)                                            | done    |
| [3.11 Парсер schema.org JobPosting](3.11-schema-org-jobposting-parser.md)                        | backlog |
| [3.12 Пагінація з лімітом 5 сторінок](3.12-pagination-limit.md)                                  | done    |
| [3.13 Життєвий цикл вакансії](3.13-vacancy-lifecycle.md)                                         | done    |
| [3.14 Check now для однієї компанії](3.14-check-now-company.md)                                  | done    |
| [3.15 Сторінка Jobs з чотирма вкладками](3.15-jobs-page-tabs.md)                                 | done    |
| [3.16 Дії над вакансією](3.16-vacancy-actions.md)                                                | done    |
| [3.17 Mark all as read у вкладці Unread](3.17-mark-all-read-unread-tab.md)                       | done    |
| [3.18 Mark all as read / unread для компанії](3.18-mark-company-read-unread.md)                  | done    |
| [3.19 Лічильник непрочитаних вакансій](3.19-unread-counter.md)                                   | done    |
| [3.20 E2E: від URL до вакансій в Unread](3.20-e2e-url-to-unread.md)                              | done    |
| [3.21 Стани завантаження й оптимістичні дії](3.21-loading-states-optimistic.md)                  | done    |
| [3.22 Перехід на вкладку під час дії над рядком](3.22-mark-then-switch-tab.md)                   | done    |
| [3.23 Один пул з'єднань з базою в продакшні](3.23-one-db-pool.md)                                | done    |
| [3.24 Парсер Breezy HR](3.24-breezy-parser.md)                                                   | done    |
| [3.25 Парсер CleverStaff](3.25-cleverstaff-parser.md)                                            | done    |
| [3.26 Парсер Hurma](3.26-hurma-parser.md)                                                        | done    |
| [3.27 Парсер Personio](3.27-personio-parser.md)                                                  | done    |
| [3.28 Парсер softgarden](3.28-softgarden-parser.md)                                              | done    |
| [3.29 Парсер rexx](3.29-rexx-parser.md)                                                          | backlog |
| [4.01 Схема check_runs + check_tasks](4.01-check-runs-tasks-schema.md)                           | done    |
| [4.02 Захоплення завдань і повернення завислих](4.02-task-claiming-stale-recovery.md)            | done    |
| [4.03 Обробник черги як фоновий цикл](4.03-queue-background-loop.md)                             | done    |
| [4.04 Check all для всіх Tracked](4.04-check-all-tracked.md)                                     | done    |
| [4.05 Індикатор прогресу в шапці](4.05-header-progress.md)                                       | done    |
| [4.06 Підсумок після завершення перевірки](4.06-check-summary.md)                                | done    |
| [4.07 Failed Sources Drawer з Retry](4.07-failed-sources-drawer.md)                              | done    |
| [4.08 Правила перетину запусків](4.08-run-overlap-rules.md)                                      | done    |
| [4.09 Статуси компанії на вкладці Tracked](4.09-tracked-company-statuses.md)                     | done    |
| [4.10 Сторінка History з Load more](4.10-history-page.md)                                        | done    |
| [4.11 E2E: Check all від запуску до підсумку](4.11-e2e-check-all.md)                             | done    |
| [4.12 Polling-маршрут стану перевірки](4.12-check-status-polling.md)                             | done    |
| [4.13 Сповіщення про нові вакансії на сторінці Jobs](4.13-new-vacancies-notice.md)               | done    |
| [4.14 Колір уваги в палітрі Ink](4.14-highlight-color.md)                                        | done    |
| [5.01 Визначення платформи за URL](5.01-platform-detection.md)                                   | done    |
| [5.02 Пошук: посилання з сайту компанії на ATS](5.02-discovery-site-ats-links.md)                | done    |
| [5.03 Пошук: кар'єрні сторінки на сайті компанії](5.03-discovery-site-career-pages.md)           | done    |
| [5.04 Пошук: ATS за назвою компанії](5.04-discovery-ats-by-name.md)                              | done    |
| [5.05 Перевірка належності сторінки компанії](5.05-page-ownership-check.md)                      | done    |
| [5.06 Пробне читання знахідок](5.06-trial-read.md)                                               | done    |
| [5.07 Find pages у модалці Add company](5.07-find-pages-modal.md)                                | done    |
| [5.08 Позначки дублікатів у списку знахідок](5.08-discovery-duplicate-marks.md)                  | done    |
| [5.09 Перша перевірка одразу після Save](5.09-first-check-after-save.md)                         | done    |
| [5.10 Find new pages для списку Not tracked](5.10-find-new-pages-not-tracked.md)                 | done    |
| [5.11 Статуси вкладки Not tracked](5.11-not-tracked-statuses.md)                                 | done    |
| [5.12 E2E: Find pages від URL до вакансій](5.12-e2e-find-pages.md)                               | done    |
| [5.13 ATS на домені компанії](5.13-ats-on-company-domain.md)                                     | backlog |
| [5.14 Find pages для однієї компанії на Not tracked](5.14-find-pages-not-tracked-company.md)     | done    |
| [5.15 Відомі ATS без парсера](5.15-known-ats-without-parser.md)                                  | done    |
| [6.01 Таблиця settings і сторінка Settings](6.01-settings-page.md)                               | done    |
| [6.02 Розрахунок часу наступної автоперевірки](6.02-next-auto-check-time.md)                     | done    |
| [6.03 Автоперевірка локально і перевірка на старті](6.03-auto-check-local.md)                    | done    |
| [6.04 AUTO_CHECK=off і спільні ліміти через ENV](6.04-auto-check-env-limits.md)                  | done    |
| [6.05 CSV Export з опціями](6.05-csv-export.md)                                                  | done    |
| [6.06 CSV Import з підсумком](6.06-csv-import.md)                                                | done    |
| [6.07 E2E: CSV туди й назад](6.07-e2e-csv-roundtrip.md)                                          | done    |
| [6.08 Окремий робочий екземпляр застосунку](6.08-separate-work-instance.md)                      | done    |
| [6.09 Резервні копії робочої бази](6.09-database-backups.md)                                     | done    |
| [6.10 Автозапуск робочого екземпляра](6.10-autostart-on-login.md)                                | done    |
| [6.11 Компанії, що потребують уваги](6.11-companies-needing-attention.md)                        | done    |
| [6.12 Подвоєна назва в модалці Add](6.12-add-dialog-doubled-name.md)                             | done    |
| [6.13 Check now під час загальної перевірки](6.13-check-now-via-queue.md)                        | done    |
| [6.14 Чекбокс у темній темі](6.14-dark-theme-checkbox.md)                                        | done    |
| [6.15 Посилання на знахідки у Find pages](6.15-found-pages-links.md)                             | done    |
| [6.16 Ліміт у вакансіях, а не в сторінках](6.16-vacancy-limit-and-quick-checks.md)               | done    |
| [6.17 Власна сторінка вакансій як «лише посилання»](6.17-reference-only-pages.md)                | done    |
| [6.18 Mark all as unread у вкладці Read](6.18-mark-all-unread-read-tab.md)                      | done    |
| [6.19 Підсвітка рядка вакансії й автозакриття підсумку](6.19-row-hover-and-summary-timeout.md)  | done    |
| [6.20 Дублікати вакансій між джерелами компанії](6.20-cross-source-duplicates.md) | done |
| [6.21 Власна кар'єрна сторінка за рецептом](6.21-own-page-recipe.md) | done |
| [6.22 Платформа DOU](6.22-dou-platform.md) | cancelled |
| [6.23 Платформа Djinni](6.23-djinni-platform.md) | cancelled |
| [6.24 Платформа Jobico](6.24-jobico-platform.md) | cancelled |
| [6.25 Парсер Workable](6.25-workable-parser.md) | done |
| [6.26 Парсер BambooHR](6.26-bamboohr-parser.md) | done |
| [6.27 Парсер Pinpoint](6.27-pinpoint-parser.md) | done |
| [6.28 Парсер TalentAdore](6.28-talentadore-parser.md) | done |
| [7.01 Neon: проєкт і підключення](7.01-neon-setup.md)                                            | backlog |
| [7.02 API-маршрут обробника розкладу](7.02-schedule-handler-route.md)                            | backlog |
| [7.03 Самоперезапуск черги на Vercel](7.03-vercel-queue-restart.md)                              | backlog |
| [7.04 Vercel Schedules раз на годину](7.04-vercel-schedules.md)                                  | backlog |
| [7.05 Перевірка серверних лімітів Vercel](7.05-vercel-limits.md)                                 | backlog |
| [7.06 Перенесення даних у Neon](7.06-neon-data-migration.md)                                     | backlog |
| [7.07 Авторизація через Google з allow-list](7.07-google-auth-allowlist.md)                      | backlog |
| [7.08 Перший деплой на Vercel](7.08-first-vercel-deploy.md)                                      | backlog |
| [7.09 Пін GitHub Actions і Dependabot](7.09-pin-actions-dependabot.md)                           | backlog |
| [7.10 Підключати CSS лише тих компонентів HeroUI, які використовуємо](7.10-heroui-css-subset.md) | backlog |
| [Розібратися з уразливостями у npm audit](npm-audit-vulnerabilities.md)                          | backlog |
| [Розкласти документацію за частинами застосунку](split-docs-by-app-part.md)                      | analyze |
| [Звірити документацію з кодом](docs-sync-with-code.md)                                           | todo    |
