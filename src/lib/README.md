# src/lib - спільна чиста логіка

Код, який потрібен і серверу, і клієнтським компонентам. Тому межа цієї теки
тримається залежностями, а не домовленістю: **нічого з `drizzle-orm`,
`src/server` чи Node API**. Модулі з `src/server` у клієнтські компоненти не
імпортуються, і саме сюди переїжджає логіка, яку треба ділити між ними.

| Шлях                   | Що в ньому                                                                  |
| ---------------------- | --------------------------------------------------------------------------- |
| `companies/`           | адреси й назви компаній, платформи, типи списку - [README](companies/README.md) |
| `uuid.ts`              | `isUuid` - форма UUID для id із клієнта                                      |
| `pagination/cursor.ts` | курсор keyset-пагінації та його розбір із недовіреного значення             |
| `vacancies/vacancy-list.ts` | вкладки Jobs (`JOBS_TABS`, `parseJobsTab`, `belongsToJobsTab`), тип рядка `VacancyListItem`, `patchVacancy` для оптимістичних дій, `adjustTabCounts` - числа вкладок із діями, що ще тривають, `countNewVacancies` для сповіщення про нові (за порядком вкладки) і `isRecentFavorite` - групи Favorites |
| `vacancies/vacancy-list.test.ts` | юніт-тести вкладок, `patchVacancy`, `adjustTabCounts`, `countNewVacancies`, `isRecentFavorite` і `placeVacancy` (рядок після Undo - на своє місце за порядком вкладки) |
| `vacancies/undo.ts` | `keepRecentUndos` - не більше трьох сповіщень Undo, найстаріші закриваються (задача vacancy-undo-toast) |
| `vacancies/undo.test.ts` | юніт-тести `keepRecentUndos` |
| `checks/check-status.ts` | `CheckStatus` - стан загальної перевірки й непрочитані, що інтерфейс отримує опитуванням |
| `checks/failed-sources.ts` | `FailedSource`, `FailedSourcesList`, `FailureReason` - рядки Failed Sources Drawer |
| `checks/status-poller.ts` | `createStatusPoller` - коли опитувати сервер про стан перевірки і коли здатися; `isBusy` - чи йде загальна перевірка або Find new pages |
| `checks/status-poller.test.ts` | юніт-тести опитувача на фейковому годиннику |
| `theme.ts`             | вибір оформлення (Light / Dark / System), імʼя cookie і розбір її значення  |
| `csv/export-options.ts` | опції Export CSV, `exportCsvHref` і `parseExportOptions` - опції в адресі `/api/companies-csv` |
| `csv/export-options.test.ts` | юніт-тести опцій |
| `csv/import-result.ts` | `CSV_IMPORT_MAX_BYTES` (1 000 000 байтів) і `ImportCsvResult` - відповідь дії імпорту |
| `settings/auto-check-interval.ts` | інтервали автоперевірки (3, 6, 12, 24 год, за замовчуванням 6) і `parseAutoCheckInterval` - `null` на будь-що поза списком |
| `settings/auto-check-interval.test.ts` | юніт-тести інтервалів |

## Курсор пагінації

Списки читаються не номером сторінки, а курсором - парою «поле сортування + id»
останнього показаного рядка: назва компанії в Companies, дата виявлення в Jobs. Як
курсор працює в запиті -
[`server/companies/README.md`](../server/companies/README.md#списки-для-сторінки-companies)
і [`server/vacancies/README.md`](../server/vacancies/README.md#списки-jobs).

Тут лежить лише форма курсора й `parseCursor`: значення приходить із клієнта, тож
непридатний курсор означає «почни з початку», а не помилку. Той самий курсор
братиме й History.

## Оформлення

`theme.ts` описує **вибір** користувача, а не те, що зараз видно на екрані:
`system` - не третя тема, а відмова вибирати. Невідоме значення cookie стає
`system`, тобто «користувач не вибирав».

Хто й коли ставить атрибут теми на сторінку і чому не React -
[`app/README.md`](../app/README.md#перемикання-теми).

## Опитування стану перевірки

`createStatusPoller` вирішує лише **коли** питати сервер; що питати й що робити з
відповіддю, передає той, хто його створює (провайдер у
[`app/components`](../app/README.md)). Тому логіку видно в юніт-тестах на фейковому
годиннику, без браузера.

- Одне опитування на завантаженні сторінки (`start`): перевірку могли запустити
  розклад чи інша вкладка.
- Поки запуск активний (`run` не `null`) - раз на `POLL_INTERVAL_MS` (3 с). Поза
  перевіркою - раз на `IDLE_POLL_INTERVAL_MS` (60 с), щоб помітити автоперевірку,
  яка почалась уже після завантаження (задача 6.29): розклад сам дивиться раз на
  хвилину, тож частіше питати марно.
- Поза перевіркою прихована вкладка (`isHidden`) не опитується. Коли її знову
  показали, власник кличе `resume` - опитування одразу, без чекання таймера.
- `track(status)` - стан, відомий без опитування, наприклад із відповіді Check all:
  показується одразу, і, якщо перевірка йде, опитування починається. Одне
  заплановане чи поточне опитування за раз, тож частота не подвоюється.
- `MAX_FAILED_POLLS` (3) невдачі поспіль - один виклик `onLost` і зупинка до
  наступного завантаження сторінки. Успіх між невдачами лічильник скидає.
