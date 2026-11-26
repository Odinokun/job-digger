# Job Digger

Персональний застосунок для пошуку кар'єрних сторінок компаній, регулярного моніторингу вакансій і показу нових вакансій. Масштаб - від десятків до 300+ компаній.

> **Стан:** рання стадія розробки. Зараз у репозиторії каркас застосунку й локальна база даних - схеми, інтерфейсу й перевірок вакансій ще немає.

## Стек

Next.js 16 (App Router, TypeScript) · HeroUI v3 + Tailwind CSS v4 · PostgreSQL + Drizzle ORM · Vitest і Playwright Test

Проєкт на ESM (`"type": "module"`). Службові скрипти запускаються просто через `node`: Node 26 виконує TypeScript без збирача і читає `.env` через `--env-file`, тому ні `tsx`, ні `dotenv` у залежностях немає. Через нативний TypeScript імпорти в таких скриптах пишуться з розширенням `.ts` (опція `allowImportingTsExtensions` у `tsconfig.json`).

## Запуск локально

```bash
nvm use        # Node 26 з .nvmrc
npm install
npm run dev
```

Застосунок буде доступний на http://127.0.0.1:3000 - лише з цього комп'ютера, назовні сервер не слухає.

Разом із сервером (`npm run dev` чи `npm start`) стартує фоновий цикл черги перевірок: його запускає [`src/instrumentation.ts`](src/instrumentation.ts) - файл, який Next виконує один раз на старті сервера. Цикл кожні 2 с дивиться в базу, тож без піднятої бази в лозі зʼявлятимуться помилки кроку черги. Як він працює - [`src/server/queue/README.md`](src/server/queue/README.md#цикл-обробника). Там само стартує розклад автоперевірки (вимикається `AUTO_CHECK=off`) - [`src/server/checks/README.md`](src/server/checks/README.md#автоперевірка).

### Install-скрипти залежностей

Частина пакетів виконує скрипти під час установки: `esbuild` лінкує платформний бінарник, `@swc/core` і `@parcel/watcher` підбирають prebuilt під систему, у `fsevents` є `binding.gyp`. npm 11 просить переглянути такі скрипти, і схвалені пакети перелічені разом із версіями в полі `allowScripts` у `package.json` - тому `npm install` і `npm ci` проходять без попереджень.

Саме поле поки що довідкове: [документація npm](https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts) прямо каже, що install-скрипти виконуються й без схвалення. Тобто попередження ніколи не означало поломки - воно означало непереглянутий код.

Коли якийсь із цих пакетів оновиться або з'явиться новий зі своїм install-скриптом, попередження повернеться. Це навмисно: новий код варто глянути, перш ніж дозволяти йому виконуватися під час установки.

| Команда                            | Що робить                                                   |
| ---------------------------------- | ----------------------------------------------------------- |
| `npm install-scripts ls`           | показує, чиї install-скрипти ще не переглянуті              |
| `npm install-scripts approve --all`| схвалює всі й записує версії в `package.json`               |
| `npm install-scripts deny <pkg>`   | явно забороняє пакет                                        |
| `npm install-scripts prune`        | прибирає записи про пакети, яких у дереві вже немає         |

Два місця, де npm поводиться несподівано: `--dry-run` у цих команд усе одно змінює `package.json` (npm 11.20), а `npm install-scripts ls` бачить менше, ніж `npm ci` - `fsevents` спливає тільки при свіжій установці.

### npm audit

CI проганяє `npm audit --audit-level=high`: нова вразливість рівня high чи critical робить PR червоним, а moderate лише видно в лозі ([розділ CI](#ci)).

**Прийнятий ризик: esbuild 0.18 у ланцюжку drizzle-kit** - [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), moderate. Ланцюжок: `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild@0.18.20`. Advisory стосується лише dev-сервера esbuild (режим `serve`): він відповідає з `Access-Control-Allow-Origin: *`, і сторонній сайт може прочитати зібрані файли. `@esbuild-kit/core-utils` викликає лише `transform` і `transformSync` - разова трансформація коду, сервер не запускається, тож вразливого коду ми не виконуємо (перевірено 21.11.2026 на drizzle-kit 0.31.11).

Чого не робимо:

- `npm audit fix --force` - відкотив би drizzle-kit до 0.18.1, а це гірше за саму проблему;
- `overrides` на новіший esbuild - виграшу немає, а `@esbuild-kit` написаний під API 0.18 і може зламатися.

Переглянути рішення, коли drizzle-kit позбудеться `@esbuild-kit/esm-loader` (пакет deprecated на користь `tsx`, який у drizzle-kit уже є).

## База даних

PostgreSQL 18 працює локально в контейнері Docker (та сама мажорна версія, що й онлайн на Neon). Потрібен запущений Docker Desktop.

```bash
cp .env.example .env    # далі вписати в .env пароль замість CHANGE_ME (у двох місцях)
docker compose up -d    # підняти базу у фоні
docker compose ps       # має бути статус healthy
npm run db:migrate      # застосувати міграції
npm run db:seed         # створити системного користувача
npm run db:seed:demo    # за бажанням: демо-компанії, щоб було на чому клікати
```

Перелік змінних із коментарями - у [`.env.example`](.env.example); сам `.env` у git не потрапляє.

Інтеграційні тести працюють на окремій базі в тому самому контейнері - вона створюється сама при першому `npm run test:integration`, потрібна лише змінна `TEST_DATABASE_URL` у `.env` ([деталі](src/server/db/testing/README.md)).

Як працює схема, міграції й seed - [`src/server/db/README.md`](src/server/db/README.md). Опис сервісу - у [`docker-compose.yml`](docker-compose.yml). База слухає `127.0.0.1:5432` і лише цей комп'ютер, назовні порт не відкритий; якщо цей порт уже зайнятий іншим PostgreSQL, його можна змінити змінною `POSTGRES_PORT`. Дані лежать у томі Docker `pgdata` і переживають перестворення контейнера.

### Шпаргалка команд

| Команда                      | Що робить                                                           |
| ---------------------------- | ------------------------------------------------------------------- |
| `docker compose up -d`       | Запустити базу у фоні (`-d` - не займати термінал)                  |
| `docker compose ps`          | Стан контейнера: чи працює, чи вже `healthy`                        |
| `docker compose logs -f db`  | Дивитися логи бази живцем (`Ctrl+C` - вийти)                        |
| `docker compose stop`        | Зупинити базу; контейнер і дані лишаються                           |
| `docker compose start`       | Запустити зупинену базу знову                                       |
| `docker compose restart db`  | Перезапустити базу                                                  |
| `docker compose down`        | Зупинити й видалити контейнер; **дані в томі лишаються**            |
| `docker compose down -v`     | Те саме плюс видалити том: **усі локальні дані бази зникнуть**       |
| `npm run db:psql`            | Відкрити psql усередині контейнера (`\q` - вийти)                   |
| `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "..."'` | Разовий SQL-запит без входу в psql |

### Про що варто знати

Змінні `POSTGRES_USER`, `POSTGRES_PASSWORD` і `POSTGRES_DB` діють **лише при першій ініціалізації**, коли тому з даними ще немає ([документація образу](https://github.com/docker-library/docs/blob/master/postgres/README.md)). Якщо змінити пароль у `.env` вже після створення бази, у самій базі він залишиться старим і підключення почне падати. Єдиний спосіб застосувати нові креденшали - `docker compose down -v` і запуск заново, тобто з втратою локальних даних.

Якщо `.env` немає або в ньому не заданий пароль, `docker compose up` одразу падає з повідомленням про потрібну змінну - база не піднімається з порожнім паролем.

`npm run db:psql` відкриває psql інтерактивно, але додаткових аргументів не прокидає: усе після `--` потрапляє в `sh`, а не в `psql`. Для разових запитів - повна команда з таблиці вище.

Кілька команд в одному `psql -c` виконуються однією транзакцією: помилка в будь-якій відкотить і попередні.

## Робочий екземпляр

Для щоденного користування - окремий `git clone` на `main` з окремою базою (рішення автора 20.11.2026, задача [6.08](tasks/6.08-separate-work-instance.md)). Тека розробки лишається для гілок, міграцій із незлитих PR і демо-даних; справжні компанії живуть лише в робочій базі.

|          | Розробка                       | Робочий екземпляр                  |
| -------- | ------------------------------ | ---------------------------------- |
| Тека     | `~/code/job-digger`            | `~/code/job-digger-app`            |
| Код      | будь-яка гілка                 | лише `main`                        |
| Сервер   | `npm run dev`, порт 3000       | `npm run app`, порт 3100           |
| База     | `job_digger`                   | `job_digger_app`                   |

Обидві бази живуть в одному контейнері `job-digger-db`, піднятому з теки розробки. У теці робочого екземпляра `docker compose` не запускається. Обробники черги в двох серверах працюють кожен зі своєю базою й одне одному не заважають.

Один раз, щоб створити:

```bash
cd ~/code
git clone git@github.com:Odinokun/job-digger.git job-digger-app
cd job-digger-app
nvm use
cp ../job-digger/.env .env   # далі див. нижче: DATABASE_URL і BACKUP_DIR
docker exec job-digger-db createdb -U job_digger job_digger_app   # -U - POSTGRES_USER з .env
npm run app:update            # залежності, копія бази, міграції, збірка
npm run db:seed               # системний користувач
npm run app                   # http://127.0.0.1:3100
```

У `.env` клону змінюються лише два рядки. У `DATABASE_URL` - тільки назва бази в кінці, після останнього `/`; користувач на початку адреси лишається `job_digger`:

```bash
DATABASE_URL=postgres://job_digger:<пароль>@127.0.0.1:5432/job_digger_app
BACKUP_DIR="/абсолютний/шлях/до/наявної/теки"
```

Після кожного merge у `main` - зупинити сервер (Ctrl+C), `npm run app:update`, `npm run app` (з автозапуском - `npm run app:restart`, див. нижче). `app:update` відмовляється працювати не на `main` і виконує `git pull --ff-only`, `npm ci`, копію бази (`npm run db:backup`), `npm run db:migrate` (на базу з `.env` цієї теки) і `npm run build`. Нова міграція в робочій базі зʼявляється лише так - після merge, а не з гілки розробки.

### Резервні копії

Копія робочої бази - файл `job_digger_app-<час UTC>.dump` (формат `pg_dump -Fc`) у теці `BACKUP_DIR` (рішення автора 20.11.2026: тека в iCloud Drive, тримаємо 30 копій). Робиться сама: `npm run app` - якщо остання копія старша за добу, `npm run app:update` - завжди, перед міграціями. Не вдалася копія - сервер не стартує, а оновлення не йде далі. Зробити копію руками - `npm run db:backup`. Логіка - [`src/server/db/backup.ts`](src/server/db/backup.ts).

Відновлення (перевірено 20.11.2026: копія бази розробки, відновлена в порожню базу, збіглася з оригіналом рядок у рядок, разом із журналом міграцій). Спершу зупинити `npm run app`, бо `dropdb` не видаляє базу з відкритими підключеннями:

```bash
docker exec job-digger-db dropdb -U job_digger --if-exists job_digger_app
docker exec job-digger-db createdb -U job_digger job_digger_app
docker exec -i job-digger-db pg_restore -U job_digger -d job_digger_app --no-owner < "<шлях до файлу .dump>"
npm run app
```

Якщо зник увесь том Docker, спершу `docker compose up -d` у теці розробки: контейнер створить базу розробки, а `job_digger_app` - ні, тож `createdb` вище потрібен.

### Автозапуск

Робочий екземпляр може стартувати сам при вході в macOS. Один раз, у клоні після `npm run app:update`:

```bash
npm run autostart:on    # з цієї хвилини сервер працює у фоні, термінал можна закрити
```

- При першому запуску macOS покаже вікно із запитом доступу до iCloud Drive (для копії в `BACKUP_DIR`) - його треба дозволити. Поки відповіді немає, копія чекає, і сервер не стартує.
- Docker Desktop теж має стартувати при вході в систему - це його власне налаштування; сервер чекає на базу скільки завгодно.
- Після кожного `npm run app:update` - `npm run app:restart`. `npm run app` у терміналі при ввімкненому автозапуску впаде з `EADDRINUSE`: порт 3100 уже зайнятий.
- Лог - `~/Library/Logs/job-digger/app.log`.
- Впав - перезапуститься сам, не частіше ніж раз на хвилину. Вимкнути автозапуск і зупинити сервер - `npm run autostart:off`.
- Змінилася версія Node (nvm) - `npm run autostart:on` ще раз: шлях до `node` записаний в автозапуск.

Як влаштовано - [`src/server/autostart/README.md`](src/server/autostart/README.md).

Cookie не розділяються за портом ([RFC 6265, розділ 8.5](https://www.rfc-editor.org/rfc/rfc6265#section-8.5)), тож мова й тема на портах 3000 і 3100 спільні.

## Скрипти

| Команда                | Що робить                                              |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Dev-сервер на `127.0.0.1:3000`                         |
| `npm run build`        | Продакшн-збірка                                        |
| `npm start`            | Запуск продакшн-збірки на `127.0.0.1:3000`             |
| `npm run app`          | Робочий екземпляр: продакшн-збірка на `127.0.0.1:3100` |
| `npm run app:update`   | Оновити робочий екземпляр після merge (лише на `main`) |
| `npm test`             | Усі тести: юніт та інтеграційні                        |
| `npm run test:unit`    | Лише юніт-тести (без бази)                             |
| `npm run test:integration` | Лише тести зі справжньою базою                     |
| `npm run test:watch`   | Тести у watch-режимі під час роботи                    |
| `npm run test:e2e`     | E2E у Playwright: сервер підіймається сам              |
| `npm run test:e2e:pending` | Лише червоний сценарій поточного етапу (тег `@pending`) |
| `npm run test:e2e:ui`  | Ті самі E2E у режимі UI - видно кроки, DOM і запити    |
| `npm run lint`         | ESLint: правила Next.js, React і TypeScript            |
| `npm run typecheck`    | Типи маршрутів Next + `tsc --noEmit`, без збірки        |
| `npm run format`       | Prettier: форматування файлів                          |
| `npm run format:check` | Prettier: лише перевірка, без змін - для CI            |
| `npm run db:generate`  | Згенерувати міграцію зі змін у схемі Drizzle           |
| `npm run db:migrate`   | Застосувати нові міграції до бази                      |
| `npm run db:seed`      | Створити системного користувача (запуск повторюваний)  |
| `npm run db:seed:demo` | Додати демо-компанії для ручної перевірки (лише локально) |
| `npm run autostart:on` | Автозапуск робочого екземпляра при вході в macOS ([деталі](#автозапуск)) |
| `npm run autostart:off` | Вимкнути автозапуск і зупинити сервер                 |
| `npm run app:restart`  | Перезапустити сервер, запущений автозапуском          |
| `npm run db:backup`    | Резервна копія бази в `BACKUP_DIR` ([деталі](#резервні-копії)) |
| `npm run db:check`     | Перевірити підключення до бази й показати її версію    |
| `npm run db:psql`      | psql у контейнері бази (потрібна піднята база)         |

## E2E-тести

Сценарії лежать у теці [`e2e/`](e2e) з розширенням `*.spec.ts` - окремо від тестів Vitest у `src`, щоб два раннери не бачили чужих файлів. Конфігурація - [`playwright.config.ts`](playwright.config.ts).

Перед першим прогоном після клонування потрібен браузер:

```bash
npx playwright install chromium
```

Він качається в кеш системи (~290 МБ), а не в репозиторій. Ставимо лише Chromium: застосунок персональний, кросбраузерність не мета.

Сценарії: `navigation.spec.ts` (застосунок відкривається), `theme.spec.ts` (перемикання оформлення), `companies.spec.ts` (компанію додано з однієї адреси, відредаговано й видалено), `vacancies.spec.ts` (дошка Greenhouse стає вакансіями в Unread - критерій етапу 3), `check-all.spec.ts` (загальна перевірка й підсумок - етап 4), `find-pages.spec.ts` (пошук сторінок - етап 5), `csv.spec.ts` (Export → Import того самого файлу без дублікатів - етап 6), `background-check.spec.ts` (відкрита сторінка Jobs показує вакансії з перевірки, яку запустили деінде), `own-page.spec.ts` (власна сторінка як список за рецептом), `companies-search.spec.ts` (пошук компанії за назвою на вкладці All) `mobile.spec.ts` (на 390 px жодна сторінка не ширша за екран, меню - з бургера) і `accessibility.spec.ts` (axe не знаходить порушень WCAG 2.2 A/AA на жодній сторінці в обох темах). Спільні пошуки елементів - `locators.ts`.

**Червоний сценарій етапу.** Сценарій-критерій пишеться на початку етапу й лишається червоним до його кінця, тому має тег `@pending`. У `playwright.config.ts` два проєкти на одному браузері: `chromium` (його запускають `npm run test:e2e` і CI) пропускає `@pending`, `pending` (`npm run test:e2e:pending`) запускає лише його й показує крок, на якому він падає. Між етапами - коли критерій попереднього вже зелений, а наступного ще не написано - команда завершується «No tests found». Прапорця `--pass-with-no-tests` свідомо немає: з ним забутий тег на новому сценарії мовчки давав би зелений прогін. Проєкти, а не `grepInvert` у корені конфігу, бо `--grep` у консолі виключення з конфігу не скасовує. Голий `npx playwright test` запускає обидва проєкти, тобто й червоний сценарій. Другий лічить зміни атрибута `data-theme`, а не кінцевий стан: баг, через який він зʼявився, кінцевого стану не ламав.

Далі достатньо `npm run test:e2e`. Застосунок піднімати заздалегідь не потрібно, а запущений `npm run dev` зупиняти теж не треба: E2E працюють поруч із ним.

- **Свій сервер.** Playwright збирає застосунок (`npm run build`) і запускає продакшн-збірку на `127.0.0.1:3001`. Не dev-сервер, бо другий `next dev` поруч із вашим не стартує: у Next 16 lockfile не дає двом `next dev` працювати в одному проєкті, а `next build` пише в окрему теку й з dev уживається. Тепла збірка займає кілька секунд. Сервер на 3001 ніколи не перевикористовується: якщо порт уже зайнятий, прогін падає, бо невідомо, з якою базою працює той сервер. Готовність сервера Playwright перевіряє за відкритим портом, а не запитом на `/`: вебсервери він підіймає ще до `globalSetup`, тобто до того, як база E2E існує, а сторінка Jobs на `/` читає базу. Перевірка за url на чистій машині (CI) чекала б вічно - локально це не видно, бо база лишається з минулих прогонів.
- **Своя база.** Сценарії додають і видаляють компанії, тому працюють не з базою розробки, а з `E2E_DATABASE_URL` (див. `.env.example`). Перед прогоном `e2e/global-setup.ts` створює її, якщо немає, проганяє міграції, чистить таблиці й заводить системного користувача; код спільний з інтеграційними тестами (`src/server/db/testing/database.ts`). `e2e/env.ts` читає `.env` (Playwright сам його не читає) і не дає адресі збігтися з `DATABASE_URL` чи `TEST_DATABASE_URL`. База одна на всі сценарії, тому вони йдуть по черзі (`workers: 1`): паралельні копії бачили б дані одна одної. Сценарій, що рахує дані по всіх компаніях (лічильник непрочитаних, Check all), ще й сам чистить базу в `beforeAll` через `resetDatabase` з `e2e/database.ts`: інакше компанії сценарію, що йшов раніше, змінили б його числа.
- **Фейковий вебсервер.** Тести ніколи не ходять на справжні сайти: поруч із застосунком Playwright піднімає на `127.0.0.1:4010` сервер зі збереженими відповідями платформ (`src/server/http/testing/serve-fake-web.ts`) і передає застосунку `FAKE_WEB_ORIGIN`. Схема адрес і самі відповіді - [src/server/http/testing/README.md](src/server/http/testing/README.md).

На CI той самий конфіг: базу дає сервіс PostgreSQL workflow, до кроків додаються HTML-звіт і одна спроба повтору впалого сценарію з трейсом.

## CI

Перевірки виконує GitHub Actions за файлом [`.github/workflows/ci.yml`](.github/workflows/ci.yml) - на кожен pull request і на кожен push у `main`. Новий коміт у гілку скасовує її попередній незавершений прогін, щоб не витрачати хвилини на вже неактуальний код.

| Job              | Що виконує                                                                           |
| ---------------- | ------------------------------------------------------------------------------------ |
| `Lint and types` | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm audit --audit-level=high` ([чому high](#npm-audit)) |
| `Tests`          | `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` (збірку робить сам Playwright) |

Версія Node береться з [`.nvmrc`](.nvmrc) - локально й на CI вона одна.

**Actions закріплені за повним commit SHA**, а не за тегом `@v7`: тег можна
переставити на інший код, якщо хтось отримає доступ до репозиторію action, а SHA
підробити не вийде ([GitHub, secure use](https://docs.github.com/en/actions/reference/security/secure-use)).
Поруч із SHA - коментар із версією (`# v7.0.1`). Оновлює їх
[Dependabot](.github/dependabot.yml): раз на тиждень відкриває PR `ci: ...`, де
міняє SHA разом із коментарем. Такий PR зливається, як і будь-який інший, після
зеленого CI.

Чому не lockfile GitHub (`.github/workflows/actions.lock`, розширення `gh actions-lock`),
хоча документація каже, що він «supersedes SHA pinning»: у нас три офіційні actions
`actions/*`, а lockfile - новий інструмент на машині автора й новий крок у CI, статус
якого документація не називає (рішення автора 21.11.2026, задача 7.09).

**База на CI.** PostgreSQL піднімається service container'ом поруч із job: той самий образ `postgres:18`, що в [`docker-compose.yml`](docker-compose.yml). Змінна `TEST_DATABASE_URL` задається прямо у workflow - контейнер живе лише цей прогін і доступний лише з машини прогону, тому в GitHub Secrets цим креденшалам не місце. Паролем служить `${{ github.run_id }}`: він унікальний для кожного прогону, і у файлі не лежить рядок, схожий на справжній пароль, - інакше на кожному PR червонів би сканер секретів. Базу `job_digger_test` і міграції на ній робить [`global-setup.ts`](src/server/db/testing/global-setup.ts), так само як локально. `DATABASE_URL` на CI не заданий: поки жодна сторінка не читає базу, він не потрібен.

**Браузери Playwright не кешуються** - так радить [документація Playwright](https://playwright.dev/docs/ci): відновлення кешу триває приблизно стільки ж, скільки завантаження, а OS-залежності під Linux однаково не кешуються.

**Коли E2E впали**, у прогоні з'являється артефакт `playwright-report` - HTML-звіт із трейсом впалого сценарію, зберігається 7 днів. На зеленому прогоні артефакту немає.

Відтворити прогін CI локально:

```bash
npm run format:check && npm run lint && npm run typecheck && npm audit --audit-level=high
npm test
CI=1 npm run test:e2e
```

**Заблокувати merge червоного PR автоматично на цьому тарифі не вийде.** Репозиторій приватний, а для приватних репозиторіїв на GitHub Free недоступні ні classic branch protection, ні rulesets - API на обидва запити відповідає `403 Upgrade to GitHub Pro or make this repository public to enable this feature`. Тому правило «PR із червоними тестами не зливається» тримається на тому, що автор дивиться вкладку Checks перед squash merge, а не на налаштуваннях GitHub.

Якщо репозиторій колись стане публічним або акаунт - Pro, вимушування вмикається опцією «Require status checks to pass before merging»: або [classic branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), або [ruleset](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets) з тим самим обмеженням (rulesets гнучкіші: на одну гілку їх може діяти кілька, класичне правило - лише одне). Обов'язковими варто робити саме job `Lint and types` і `Tests`: сторонні чеки (наприклад сканер секретів GitGuardian) можуть червоніти через історію гілки, яка при squash merge у `main` не потрапляє.

## Доступність

Ціль - [WCAG 2.2](https://www.w3.org/TR/WCAG22/) рівня AA: усі критерії рівнів A і AA ([що означають рівні](https://www.w3.org/WAI/WCAG22/Understanding/conformance)). Як це перевіряється:

- **Автоматично на кожному PR** - `e2e/accessibility.spec.ts`: [axe](https://playwright.dev/docs/accessibility-testing) (`@axe-core/playwright`) сканує всі сторінки й модалку Add company у світлій і темній темах за тегами WCAG 2.x A/AA, а також правилом `heading-order` (заголовки без стрибків через рівень; в axe воно best practice). Порушення валить E2E.
- **Lighthouse** (26.11.2026, категорія Accessibility): на Companies 98 через `heading-order`, решта сторінок - без зауважень. Після прихованого `h2` над списком компаній це правило проходить і в axe-скануванні.
- **Руками** - клавіатура (порядок Tab, видимий фокус, повернення фокусу з модалок і меню), reflow на 320 px і масштаб 200%, сценарії з VoiceOver. Автоматика ловить лише частину проблем, тому ручна перевірка лишається.

Правила для коду й рішення щодо кольорів - [src/app/README.md](src/app/README.md#доступність), історія аудиту - [tasks/accessibility-audit.md](tasks/accessibility-audit.md).

## Локалізація

Інтерфейс англійською й українською. Переклади - у [`messages/en.json`](messages/en.json) і [`messages/uk.json`](messages/uk.json), набір ключів у них однаковий і це перевіряє тест [`src/i18n/messages.test.ts`](src/i18n/messages.test.ts). Коди мов - підтеги за BCP 47: `uk` - українська мова (не країна, країна була б `UA`).

Мова **не живе в URL**: next-intl налаштований у режимі без i18n-роутингу, бо за планом мова - особисте налаштування користувача. Локаль читається з cookie `locale` у [`src/i18n/request.ts`](src/i18n/request.ts), невідоме значення відкидається, фолбек - English. Список мов - [`src/i18n/config.ts`](src/i18n/config.ts).

Перемикача мови в інтерфейсі ще немає - він з’явиться разом з екраном Settings. Щоб побачити українську зараз, досить виставити cookie в DevTools:

```js
document.cookie = "locale=uk; path=/";
```

Наслідок читання cookie: усі сторінки рендеряться на кожен запит (у виводі `npm run build` вони позначені як `ƒ Dynamic`). Для застосунку, який показує дані з бази, це не втрата.

## Ліцензія

Код проєкту - [MIT](LICENSE). Не під MIT: скіли агента в `.agents/skills/` (чужий код зі своїми ліцензіями, деталі - [.claude/README.md](.claude/README.md#скіли)) і збережені відповіді сайтів у `src/server/http/testing/responses/` (копії публічних сторінок лише для тестів, [src/server/http/testing/README.md](src/server/http/testing/README.md#збережені-відповіді)).

## Документація

- [Задачі й етапи](tasks/README.md) - що зроблено, що в роботі, що далі.
- [Екрани](src/app/README.md#що-на-екранах-і-чого-свідомо-немає) - що показує кожен розділ і чого в ньому свідомо немає.
- [Правила розробки](CLAUDE.md) - процес, мова, тести, Git і задачі.
