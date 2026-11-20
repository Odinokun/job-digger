# src/server/parsers - парсери вакансій

Читають вакансії з кар'єрних джерел: API платформ (ATS), а згодом і
розмітки schema.org JobPosting ([docs/discovery-and-parsing.md](../../../docs/discovery-and-parsing.md),
розділ 6). Усі запити - через єдиний HTTP-клієнт ([`src/server/http`](../http/README.md)).

## Файли

| Файл                 | Роль                                             |
| -------------------- | ------------------------------------------------ |
| `types.ts`           | Спільний формат: `ParsedVacancy`, `ParseResult`, `ParserError` |
| `greenhouse.ts`      | Greenhouse: `readGreenhouse(sourceUrl, client)` і його частини |
| `greenhouse.test.ts` | Юніт-тести парсера Greenhouse                     |
| `greenhouse.integration.test.ts` | `readGreenhouse` через фейковий вебсервер |
| `shared.ts`          | Спільне для парсерів: `collectVacancies` (правило кривих записів), `fetchJson` і `postJson` (запит → статус → JSON), `fetchText` (те саме для HTML, плюс адреса після редиректів), `UNREADABLE`, `isRecord`, `isWebUrl` |
| `shared.test.ts`     | Юніт-тести `collectVacancies`                     |
| `lever.ts`           | Lever: `readLever(sourceUrl, client)`, `leverSite`, `parseLeverPostings` |
| `lever.test.ts`      | Юніт-тести парсера Lever                          |
| `lever.integration.test.ts` | `readLever` через фейковий вебсервер і сервер зі сторінками |
| `ashby.ts`           | Ashby: `readAshby(sourceUrl, client)`, `ashbyBoard`, `parseAshbyJobs` |
| `ashby.test.ts`      | Юніт-тести парсера Ashby                          |
| `ashby.integration.test.ts` | `readAshby` через фейковий вебсервер, зокрема відповідь понад 5 МБ |
| `workday.ts`         | Workday: `readWorkday(sourceUrl, client)`, `workdaySite`, `parseWorkdayJobs` |
| `workday.test.ts`    | Юніт-тести парсера Workday                        |
| `workday.integration.test.ts` | `readWorkday` через фейковий вебсервер і сервер зі сторінками |
| `peopleforce.ts`     | PeopleForce: `readPeopleForce(sourceUrl, client)`, `peopleforceSite`, `parsePeopleForcePage` |
| `peopleforce.test.ts` | Юніт-тести парсера PeopleForce                   |
| `peopleforce.integration.test.ts` | `readPeopleForce` через фейковий вебсервер і сервер зі сторінками |
| `breezy.ts`          | Breezy HR: `readBreezy(sourceUrl, client)`, `breezyCompany`, `parseBreezyPositions` |
| `breezy.test.ts`     | Юніт-тести парсера Breezy HR                      |
| `breezy.integration.test.ts` | `readBreezy` через фейковий вебсервер |
| `cleverstaff.ts`     | CleverStaff: `readCleverStaff(sourceUrl, client)`, `cleverstaffSource`, `cleverstaffBoardUrl`, `parseCleverStaffVacancies` |
| `cleverstaff.test.ts` | Юніт-тести парсера CleverStaff                  |
| `cleverstaff.integration.test.ts` | `readCleverStaff` через фейковий вебсервер: дошка й посилання на вакансію |
| `hurma.ts`           | Hurma: `readHurma(sourceUrl, client)`, `hurmaCompany`, `hurmaBoardUrl`, `parseHurmaVacancies`, `hurmaHasNextPage` |
| `hurma.test.ts`      | Юніт-тести парсера Hurma                          |
| `hurma.integration.test.ts` | `readHurma` через фейковий вебсервер і сервер зі сторінками та перевіркою заголовка |
| `personio.ts`        | Personio: `readPersonio(sourceUrl, client)`, `personioBoard`, `parsePersonioFeed` |
| `personio.test.ts`   | Юніт-тести парсера Personio                       |
| `personio.integration.test.ts` | `readPersonio` через фейковий вебсервер |
| `softgarden.ts`      | softgarden: `readSoftgarden(sourceUrl, client)`, `softgardenSource`, `softgardenBoardUrl`, `parseSoftgardenBoard` (стара дошка, HTML), `parseSoftgardenFeed` (кар'єрний сайт, JSON) |
| `softgarden.test.ts` | Юніт-тести парсера softgarden                     |
| `softgarden.integration.test.ts` | `readSoftgarden` через фейковий вебсервер і сервер з відповіддю 400 |
| `vacancies-to-check.ts` | `VACANCIES_TO_CHECK` - спільний ліміт вакансій для парсерів, що читають сторінками; `pagesToRead` - скільки це сторінок при глибині `ReadDepth`; `parseVacanciesToCheck` |
| `vacancies-to-check.test.ts` | Розбір змінної і скільки сторінок читати |
| `own-page.ts`        | Власна сторінка за рецептом (задача 6.21): `findLinkGroups` (кандидати в рецепт), `parseOwnPage` і `readOwnPage` (читання за префіксом) |
| `own-page.test.ts`   | Юніт-тести груп і назв на справжніх сторінках kinggroup, delasport, ncube, a-listware |
| `own-page.integration.test.ts` | `readOwnPage` і `readSource` для `own_page` через фейковий вебсервер |
| `read-source.ts`     | `readSource(source, client)` - парсер за платформою джерела, а для `own_page` - за рецептом джерела; `null`, якщо парсера ще немає |

## Спільний формат

Парсер повертає `{ ok: true, vacancies, skipped }` або `{ ok: false, error }` (`types.ts`).

- **Вакансія** - `externalId` (ID на платформі, з нього складається ключ; `null`, якщо
  платформа ID не дає - тоді ключ з адреси), `title`,
  `url` (лише http/https) і `location` (може бути `null` - тоді в списку «—»).
- **Помилки:** `not-found` (сторінки чи дошки немає, 404), `unreadable` (відповідь не
  того формату або адреса не та), `bad-status` (сайт відповів інакше, ніж 2xx чи 404,
  - зі статусом), `fetch-failed` (збій запиту, з причиною `HttpError`).
- **Криві записи - два види** (`collectVacancies` у `shared.ts`, docs/discovery-and-parsing.md,
  розділ 6):
  - **зламана структура** - запис не обʼєкт, id не того типу чи порожній, назва чи
    адреса не рядок. Це сигнал зміни формату: уся відповідь невдала, бо якби такі
    записи пропускалися, пропущеними виявились би всі, і порожній список видалив би
    всі вакансії джерела. Невдала перевірка вакансій не чіпає;
  - **вада даних** - порожня назва чи адреса не http(s). Вакансія пропускається й
    рахується в `skipped` (parse warning у деталях завдання, задача 4.01). Пропущені
    всі записи непорожнього списку - теж невдала відповідь.

  До 3.08 будь-який кривий запис валив усю відповідь (рішення 3.06). Справжні дані
  показали ціну: одна вакансія OpenAI з порожньою назвою блокувала всі 839. Правило
  змінене за рішенням автора 18.11.2026.
- Парсер лише читає, що є на платформі зараз. Дата виявлення, Read/Unread, ключ і
  очищення URL - життєвий цикл (задачі 3.13 і 3.05).

## Ліміт вакансій і глибина

Парсери, що читають список сторінками (Lever, Workday, PeopleForce, Hurma), читають не
більше `VACANCIES_TO_CHECK` вакансій (`vacancies-to-check.ts`, змінна з тим самим
іменем у `.env.example`, за замовчуванням 500). Сторінки рахуються з розміру
сторінки платформи (`pagesToRead`): PeopleForce - 50, Workday - 25, Lever і Hurma - 5.
До задачі 6.16 ліміт був у сторінках (`PAGES_TO_CHECK = 5`), і той самий ліміт давав
то 50 вакансій, то 500.

**Глибина** (`depth`): `full` - до ліміту, `first-page` - лише перша сторінка. Хто
скільки читає - [`src/server/checks`](../checks/README.md#глибина-читання).

**Неповний список.** Якщо читання зупинилось на ліміті чи першій сторінці, а не
тому, що список скінчився, результат має `truncated: true`. Тоді життєвий цикл
нічого не позначає зниклим (`src/server/vacancies`): вакансії за межею не зникли,
їх просто не читали. Досягнення ліміту - як і раніше, успішна перевірка. Парсери, що
беруть усе одним запитом, `truncated` не ставлять ніколи.

Тести, яким потрібна конкретна кількість сторінок, передають `maxPages` явно:
Vitest завантажує `.env` (`vitest.config.ts`), і значення автора не має впливати на
результат.

## Як додати платформу

Перелік місць, яких торкається нова платформа. Зібраний за тим, як підключали
PeopleForce. Окрема задача на кожну платформу, TDD, як у етапі 3.

**Підготовка**

- [ ] Звірити API з офіційною документацією й дати посилання. Немає публічного
      API - читати публічну сторінку, як PeopleForce, і записати, що формат
      перевірено справжніми сторінками, а не документацією.
- [ ] Кількома справжніми запитами з User-Agent застосунку перевірити, чого
      документація не каже: відповідь на невідому дошку, розмір відповіді,
      сторінки, порядок вакансій.
- [ ] Зберегти невелику справжню відповідь у `src/server/http/testing/responses/<хост>/`
      і рядок про неї в [README фейкового сервера](../http/testing/README.md).

**Платформа**

- [ ] `src/lib/companies/platform.ts` - значення в `CAREER_PLATFORMS` і домен у
      `PLATFORM_DOMAINS`. Таблиця доменів у [README `src/lib/companies`](../../lib/companies/README.md).
- [ ] Прибрати платформу з `src/lib/companies/known-ats.ts`: там лише ATS без
      парсера, і рядок, що лишився, підписував би джерело назвою з того списку.
- [ ] Міграція: enum `career_platform` будується з `CAREER_PLATFORMS`, тож
      `npm run db:generate` ([порядок роботи з міграціями](../db/README.md)).
- [ ] `src/lib/companies/suggest.ts` - якщо назва компанії в адресі живе в
      субдомені, а не в першому сегменті шляху (`SUBDOMAIN_SLUG_PLATFORMS`).
- [ ] Назва платформи в `messages/en.json` і `messages/uk.json`
      (`platforms.*`) і в `src/app/companies/page.tsx`.

**Парсер**

- [ ] `<платформа>.ts` - `read<Платформа>(sourceUrl, client)`, функція, що дістає
      дошку з будь-якого посилання, і розбір відповіді. Формат результату й
      правило кривих записів - «Спільний формат» вище.
- [ ] Юніт-тест розбору на збереженій відповіді й інтеграційний через фейковий
      вебсервер.
- [ ] Рядок у `READERS` у `read-source.ts`.
- [ ] Читає сторінками - `depth` і `pagesToRead`, `truncated`, якщо зупинився на ліміті («Ліміт вакансій і глибина» вище).
- [ ] Розділ про платформу в цьому README і рядки у таблиці «Файли».

**Пошук сторінок** ([`src/server/discovery`](../discovery/README.md))

- [ ] `board-url.ts` - єдина адреса дошки з функції парсера.
- [ ] `by-name.ts` - якщо адресу дошки можна вгадати за назвою компанії. Кожна
      платформа тут - ще один запит на кожен варіант назви кожної компанії.
- [ ] `ownership.ts` - хост платформи в `PLATFORM_DOMAINS` і, якщо можна, як
      зі сторінки дошки прочитати сайт компанії.

**Наприкінці**

- [ ] Ручна перевірка на справжній мережі: дві-три справжні дошки й неіснуюча.
- [ ] Find new pages для Not tracked, щоб компанії на новій платформі перейшли в
      Tracked.

## Greenhouse

API - `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`, без
авторизації ([документація](https://docs.greenhouse.io/job-board.html)).

`greenhouseBoardToken` дістає назву дошки з адреси джерела в тому вигляді, як вона
лежить у `career_sources.url` (абсолютна, як ввів користувач): сама дошка
(`job-boards.greenhouse.io/discord`, `boards.greenhouse.io/discord`), посилання на
вакансію (`.../discord/jobs/123`), вбудована дошка (`/embed/job_board?for=discord`).
Не дошка Greenhouse - `null`. Хост ЄС (`job-boards.eu.greenhouse.io`) не
підтримується: підтвердженого API для нього немає.

`parseGreenhouseJobs` бере з кожної вакансії `id` (ID оголошення, той самий, що в
посиланні; `internal_job_id` - ID посади, і в оголошень-«prospect» він `null`),
`title`, `absolute_url` і `location.name`. Тест читає справжню відповідь дошки
Discord зі збережених відповідей фейкового вебсервера.

`readGreenhouse(sourceUrl, client)` складає все разом: назва дошки → запит через
HTTP-клієнт → розбір. Адреса без дошки Greenhouse - `unreadable` без запиту.
Інтеграційні тести ходять на фейковий вебсервер зі збереженою відповіддю Discord,
а для відповідей, яких там немає (не JSON, 403, мовчання), - на свій сервер.
Перевірено й на справжній мережі (вручну, 18.11.2026): Discord - 26 вакансій,
Figma - 144, неіснуюча дошка - `not-found`.

## Lever

API - `https://api.lever.co/v0/postings/{site}?mode=json` (дошки `jobs.lever.co`) і
`https://api.eu.lever.co/...` (дошки `jobs.eu.lever.co`), без авторизації
([документація](https://github.com/lever/postings-api)). Сайт - перший сегмент шляху
дошки; `leverSite` розуміє й посилання на оголошення та форму відгуку.

**Сторінками, а не одним запитом.** Без `limit` Lever віддає все одразу разом з
описами: Palantir (306 вакансій) - 5,9 МБ, більше за `MAX_BYTES` клієнта (5 МБ), і
джерело не читалося б зовсім. Тому `readLever` просить по 100 (`skip`/`limit`),
близько 2 МБ за раз, до ліміту вакансій («Ліміт вакансій і глибина» вище). Неповна
сторінка - остання; повна - ще один запит, що прийде порожнім. Збій будь-якої сторінки - збій усього джерела.

**Lever сортує не за датою** (перевірено на Palantir і демо-сайті), тож на сайті з
понад 500 вакансіями ті, що за межею ліміту, не читаються. Зниклими вони не
стають - список позначено `truncated` (задача 6.16).

`parseLeverPostings`: `externalId` - `id` (UUID, він же в `hostedUrl`), назва -
`text`, посилання - `hostedUrl`, локація - усі `categories.allLocations` через кому,
а без них - `categories.location`. Невідомий сайт - 404 з
`{"ok":false,"error":"Document not found"}`, тобто `not-found` (документація цього
не описує, перевірено 18.11.2026).

Перевірено на справжній мережі (вручну, 18.11.2026): Palantir - 306 вакансій за 4
сторінки, демо-сайт - 10, неіснуючий сайт - `not-found`.

## Ashby

API - `https://api.ashbyhq.com/posting-api/job-board/{name}`, без авторизації
([документація](https://developers.ashbyhq.com/docs/public-job-posting-api)). Назва
дошки - перший сегмент шляху `jobs.ashbyhq.com/{name}`; регістр неважливий
(перевірено: `Ashby` і `ashby` віддають те саме).

**Один запит з більшим лімітом розміру.** Сторінок API не має, а описи вакансій
віддає завжди: OpenAI (839 вакансій) - 14 МБ, сама Ashby (77) - 4,4 МБ при
спільному ліміті клієнта 5 МБ. Тому `readAshby` просить для свого запиту 30 МБ
(`ASHBY_MAX_BYTES`, `client.get(url, { maxBytes })`); довільні сайти лишаються з
5 МБ (рішення автора 18.11.2026).

`parseAshbyJobs`: `externalId` - `id` (UUID, він же в `jobUrl`; документація поле
не описує, але API його віддає), назва - `title`, посилання - `jobUrl`, локація -
`location` і після неї `secondaryLocations` через кому. Вакансія з `isListed: false`
доступна лише за прямим посиланням, на дошці її не видно - її пропускаємо, і в
`skipped` вона не рахується. Невідома дошка - 404 `Not Found` (документація не
описує, перевірено 18.11.2026).

Перевірено на справжній мережі (вручну, 18.11.2026): Linear - 33 вакансії, Ashby -
77, OpenAI - 838 і одна пропущена (порожня назва), неіснуюча дошка - `not-found`.

## Workday

**Публічної документації API немає.** Парсер ходить туди ж, куди й сам career site
Workday у браузері: `POST https://{host}/wday/cxs/{tenant}/{site}/jobs` з тілом
`{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`, без авторизації. Усе
нижче перевірено справжніми запитами 18.11.2026 (NVIDIA, Salesforce, Workday) і
може змінитися без попередження - тому зламана структура тут, як і всюди, валить
усю відповідь, а не тихо дає нуль вакансій.

- **Лише POST.** GET на ту саму адресу - 400. Тому в HTTP-клієнта є `post`
  ([`src/server/http`](../http/README.md#модуль-запитів)).
- **Адреса.** `workdaySite` розуміє обидва формати career site: `{tenant}.wd5.myworkdayjobs.com/{site}`
  і `wd5.myworkdaysite.com/recruiting/{tenant}/{site}`; сегмент мови (`/en-US/`) і
  посилання на вакансію теж. Той самий tenant відповідає на обох доменах.
- **Сторінки по 20.** Більше Workday не приймає: `limit: 50` - 400. Ліміт -
  `VACANCIES_TO_CHECK`, за замовчуванням 500 вакансій, тобто 25 сторінок
  (у NVIDIA їх понад 2000).
  Перша сторінка, схоже, починається з найновіших («Posted Today»), але порядок не
  строгий і ніде не описаний.
- **Кінець списку - за `total` першої сторінки** або за неповною сторінкою. На
  наступних сторінках `total` дорівнює 0, а з `offset` від 2000 Workday знову віддає
  першу сторінку - «питати, доки не прийде порожня» тут зациклилось би.
- **ID - `externalPath`** (`/job/Poland-Warsaw/Engineer_JR2028965-1`). Окремого ID
  у списку немає, а номер заявки з `bulletFields` не унікальний: в однієї заявки
  буває кілька оголошень (`_JR2028965-1` при `bulletFields: ["JR2028965"]`). Ціна:
  у шляху є назва вакансії, тож перейменована вакансія стане новою Unread, а стара
  зникне. Справжній ID (`jobPostingInfo.id`) дає лише окремий запит на кожну
  вакансію - 100 запитів з паузою 2 с замість 5.
- **Посилання** - адреса career site плюс `externalPath`
  (`nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/...`), відкривається.
- **Локація** - `locationsText` як є. Для вакансії з кількома локаціями це
  «2 Locations»: самі локації знову лише в окремому запиті на вакансію.
- **Помилки:** невідомий сайт компанії - 404 `not found: Job_Posting_Site_ID`,
  тобто `not-found`; невідомий tenant - 422, тобто `bad-status` 422 (що саме
  означає 422, Workday не пояснює, тож у `not-found` не перетворюємо).

Перевірено на справжній мережі (вручну, 18.11.2026): NVIDIA на обох доменах і сам
Workday - по 100 вакансій за 5 сторінок (близько 9 с через паузу 2 с між запитами),
усі ID різні; невідомий сайт - `not-found`, невідомий tenant - `bad-status` 422.

## PeopleForce

**HTML, а не API.** Careers API PeopleForce вимагає ключ компанії
([документація](https://developer.peopleforce.io/careers/v1/getting-started)), тож
парсер читає публічну сторінку `https://{company}.peopleforce.io/careers` - так, як
її бачить відвідувач. Розмітку розбирає Cheerio. Формат перевірено справжніми
сторінками 18.11.2026 (PeopleForce, Webellian, V2Cloud), документації в нього немає.

- **Адреса.** `peopleforceSite` бере субдомен компанії; сам `peopleforce.io` і `www` -
  сайт платформи, не компанії. Посилання на вакансію теж годиться.
- **Картка вакансії** - посилання в `h4` всередині `#results`: шлях
  `/careers/v/{ID}-{slug}`, `externalId` - числовий ID (slug зі зміною назви
  зміниться, ID - ні). Локація - текст поруч з іконкою `fa-map-marker-alt`; є не в
  усіх компаній (у Webellian на картках немає нічого, крім назви), тоді `null`.
- **Нуль довіряємо лише разом з лічильником.** Це HTML, і змінена верстка легко дала
  б «нуль вакансій» - видалення всіх. Над картками PeopleForce пише «Displaying
  X - Y of N in total»: текст перекладається («Відображено ... з ...»), числа в
  `<strong>` - ні. Карток має бути рівно Y - X + 1. Немає ні лічильника, ні карток -
  вакансій справді немає («There are currently no vacancies.»). Будь-яке інше
  поєднання, як і сторінка без `#results`, - `unreadable`.
- **Сторінки по 10** (`PEOPLEFORCE_PAGE_SIZE`), `?page=N`, до ліміту вакансій (за
  замовчуванням 500, тобто 50 сторінок). Наступна - лише за посиланням `rel="next"`
  у `nav[aria-label="pager"]`: номер за межею списку PeopleForce не відхиляє, а
  віддає останню сторінку ще раз.
- **Помилки:** невідома компанія - 404; компанія без сторінки кар'єри - 302 на
  `/404`, а та - 404. Обидва випадки - `not-found`.

Перевірено на справжній мережі (вручну, 18.11.2026): PeopleForce - 6 вакансій,
Webellian - 23 за 3 сторінки, V2Cloud - 3; компанія без сторінки кар'єри (`macpaw`) і
неіснуюча - `not-found`.

## Breezy HR

**Публічний JSON без документації.** Дошка `https://{company}.breezy.hr` віддає
свої вакансії на `https://{company}.breezy.hr/json`, без ключа. Офіційно цей
JSON ніде не описаний - про нього пишуть лише сторонні скрапери, тож усе нижче
перевірено справжніми запитами 19.11.2026 (дошки самої Breezy - `breezy` і `jobs`)
і може змінитися без попередження.

- **Адреса.** `breezyCompany` бере субдомен компанії, зокрема з посилання на
  вакансію (`/p/{id}-{slug}`). Субдомени самої Breezy - не компанії: `assets-cdn`
  (на ньому скрипти вбудованої дошки, тож посилання на нього трапляються на сайтах
  компаній), `app`, `www`.
- **Один запит, без сторінок:** масив усіх вакансій.
- **Поля:** `externalId` - `id` (він же на початку шляху вакансії), назва - `name`,
  посилання - `url`, локація - `location.name`, а для віддаленої вакансії
  (`location.is_remote: true`) - з приміткою «remote» (`United States, remote`).
- **Помилки:** невідома дошка - 404 (HTML-сторінка «not found»), тобто `not-found`.
  Сторонні скрапери пишуть, що компанія може вимкнути публічний JSON; як тоді
  відповідає дошка, перевірити не було на чому.
- **Сайт компанії** на сторінці дошки - пункт шапки `li.link.company`: за ним
  перевіряється належність дошки, знайденої за назвою (`src/server/discovery/ownership.ts`).

Перевірено на справжній мережі (вручну, 19.11.2026): `breezy` - 3 вакансії, `jobs` -
одна віддалена, неіснуюча дошка - `not-found`.

## CleverStaff

**Дошка - SPA на хості самої платформи:** `https://cleverstaff.net/i/{alias}-vacancies`,
вакансія - `https://cleverstaff.net/i/vacancy-{localId}`. Дані сторінка бере з
публічного API без ключа. Перевірено справжніми запитами 19.11.2026 (8allocate,
-A-HR-, MEV).

- **Не задокументований `getAllOpenVacancy`, а не задокументований `getVacancies`.**
  [Документація](https://neo.cleverstaff.net/api.html) описує
  `GET /hr/public/getVacancies?alias=`, але на дошку без вакансій (MEV) він
  відповідає `notFound`, так само як на неіснуючу - і перевірка вирішила б, що
  дошки немає. Сама сторінка дошки ходить на `GET /hr/public/getAllOpenVacancy?alias=&lang=en`
  (видно з її JavaScript), і той для порожньої дошки дає `status: "ok"` без поля
  `objects`. Ціна - API без документації, може змінитися без попередження.
- **Помилки приходять зі статусом 200:** `{"status":"error","code":"notFound"}` -
  `not-found`, інший `code` (наприклад, `accountBlocked`) - `unreadable`.
- **Аліас чутливий до регістру** і буває з дефісами (`-A-HR-`).
- **Посилання на вакансію** аліаса компанії не містить: парсер спершу питає
  `GET /hr/public/getVacancy?host=&id={localId}` (поле `object.alias`), потім читає
  дошку. Закрита вакансія - `vacancyIsNotPublic`, тобто `not-found`.
- **Поля:** `externalId` - `localId`, назва - `position`, посилання складається з
  `localId`, локація - `displayFullName` усіх `regions` через «; » (або `region`),
  для `workCondition: "remote"` - з приміткою «remote». Статуси на публічній
  дошці - `inwork`, `open`, `replacement`, усі відкриті, тож не фільтруються.
- Один запит на всю дошку, сторінок немає. Відповідь з описами вакансій:
  33 вакансії - 514 КБ.

Перевірено на справжній мережі (вручну, 19.11.2026): -A-HR- - 33 вакансії з
локаціями, посилання на вакансію 8allocate - 8, MEV - 0, неіснуюча дошка - `not-found`.

## Hurma

**API публічної сторінки, без документації.** Сторінка вакансій компанії -
`https://{company}.hurma.work/public-vacancies`, SPA: у HTML вакансій немає.
Дані вона бере з `GET /api/v1/public-vacancies` (видно з її JavaScript). Довідка
Hurma ([Job opening page](https://support.hurma.work/en/collections/34-job-opening-page))
ні адреси сторінки, ні API не описує, тож усе нижче перевірено справжніми
запитами 19.11.2026 (Spribe, Talents Boutique, Dataforest, mono, Nova Ukraine) і
може змінитися без попередження.

- **Заголовок `X-Requested-With: XMLHttpRequest` обовʼязковий:** без нього API
  відповідає 403 з будь-яким User-Agent, зокрема браузерним. Це позначка Laravel
  «запит від JavaScript сторінки», а не захист від ботів; robots.txt порожній.
  Рішення автора 19.11.2026 - слати його, UA лишається чесним. Клієнт для цього
  має `headers` у налаштуваннях запиту ([`src/server/http`](../http/README.md#модуль-запитів)).
- **Адреса.** `hurmaCompany` бере субдомен компанії, зокрема з посилання на
  вакансію (`/public-vacancies/{id}`). Субдомени самої Hurma - не компанії:
  `www`, `academy` (навчання), `support` (довідка). `demo` - демо-компанія Hurma,
  вона читається як будь-яка інша.
- **Сторінки по 100** (`per_page=100&page=N`; більше API не приймає - 422 «per
  page must be 100 maximum», за замовчуванням 20), до ліміту вакансій -
  за замовчуванням 500, тобто 5 сторінок. Наступна - лише якщо є `links.next` (відповідь у
  форматі пагінації Laravel). Сторінка за межею списку - порожня, а не остання.
- **Поля:** окремого ID немає - `externalId` це число в кінці `public_url`
  (`/public-vacancies/243`); адреса без нього - зламана структура. Назва -
  `name`, посилання - `public_url` (відкривається, 200), локація - `residence`
  (місця через «|» стають «, ») і за ним `work_format` («Remote», «In the
  office/On site»). У багатьох вакансій обидва поля порожні - тоді `null`.
- **Порядок** не за датою і ніде не описаний: у Talents Boutique - за назвою, у
  Dataforest - ні те, ні те.
- **Помилки:** невідома компанія - 404 «default backend - 404» від балансувальника,
  тобто `not-found`.
- **Сайту компанії** сторінка не показує (лише назву й логотип), тож належність
  дошки, знайденої за назвою, не перевіряється.

Перевірено на справжній мережі (вручну, 19.11.2026): Spribe - 6 вакансій,
посилання на вакансію Talents Boutique - 40 за одну сторінку, mono - 1 з
локацією «Київ, Україна», неіснуюча компанія - `not-found`; за назвою Monobank і
Spribe знаходять свої дошки Hurma. Дошки без вакансій знайти не вдалося, тож
відповідь на неї перевірено лише тестом (порожній `data`).

## Personio

**Задокументований XML-фід:** `https://{company}.jobs.personio.de/xml`, без ключа
([документація](https://developer.personio.de/docs/retrieving-open-job-positions)).
Корінь `<workzag-jobs>`, вакансія - `<position>`, посилання на вакансію -
`https://{company}.jobs.personio.de/job/{id}` (з прикладу інтеграції там само).
XML розбирає Cheerio в режимі `xml: true` - та сама бібліотека, що для HTML.

Чого документація не каже, перевірено справжніми запитами 19.11.2026 (Astrafy,
Telio Group, IITS, DCI, PJM):

- **Адреса.** `personioBoard` розуміє дошку, фід і посилання на вакансію.
  `{company}.jobs.personio.com` віддає той самий фід, тож дошка лишається на тому
  домені, що в посиланні. `www` - не компанія, а `personio.com` - сайт постачальника.
- **Один запит, без сторінок:** усі вакансії разом з описами. DCI (25 вакансій) -
  140 КБ; до спільного ліміту 5 МБ далеко, але дошку з сотнями вакансій
  перевірити не було на чому.
- **`?language=` не потрібен:** без нього фід повний, а з `language=de` у Astrafy
  зникли блоки описів, яких немає німецькою. Назви вакансій ті самі.
- **Поля:** `externalId` - `id` (лише цифри, інакше зламана структура), назва -
  `name` (саме дочірній `<name>` позиції: у блоків опису теж є `<name>`), локація -
  `office` і за ним `additionalOffices/office` через кому, без повторів.
  `additionalOffices` у таблиці документації немає, але фід його віддає.
- **Помилки:** невідома дошка - 404, тобто `not-found`. Закрита вакансія за
  `/job/{id}` - теж 404. Чи може компанія вимкнути фід, документація не каже.
- **Сайт компанії** на сторінці дошки - логотип у шапці (`a.logo-wrapper`): за ним
  перевіряється належність дошки, знайденої за назвою (`src/server/discovery/ownership.ts`).

Перевірено на справжній мережі (вручну, 19.11.2026): DCI - 25 вакансій, посилання
на вакансію Telio Group на `.com` - 11, IITS з `?language=de` у посиланні - 8,
неіснуюча дошка - `not-found`; за назвою Astrafy знаходить свою дошку (4
вакансії), належність дошки Telio Group до `tel.io` підтверджена логотипом.

## softgarden

**Два продукти, обидва без документації.** Документований API
([dev.softgarden.de](https://dev.softgarden.de/frontend-v3/jobs-eines-kanals/),
`api.softgarden.io`) потребує client ID від softgarden, тож для нас закритий.
Публічно читаються дві різні дошки, і `softgardenSource` розрізняє їх за хостом.
Усе нижче перевірено справжніми запитами 19.11.2026 і може змінитися без
попередження. Рішення автора 19.11.2026: обидві в одній платформі `softgarden`.

**Стара дошка `https://{company}.softgarden.io/{lang}/vacancies`** (DPS, Alcedis,
Sikla, Nuvisan, Kraftanlagen, JD Sports, Plath) - серверний HTML (Apache Wicket),
читається Cheerio.

- **Усі вакансії однією сторінкою.** Сторінки по 10-20 малює JavaScript
  (`jobs_per_page` у скрипті), у HTML - усі картки: Kraftanlagen - 85.
  Корінь дошки - 302 на `/en/vacancies`; парсер одразу просить `/en/vacancies`
  (назви вакансій мовою не перекладаються).
- **Картка** - `.matchElement#job_id_{id}`; шапка таблиці теж `.matchElement`, але
  з `.matchHeadline`. Назва й посилання - `.title a` (`../job/{id}/{slug}?jobDbPVId=...`;
  рядок запиту відкидається), локації - `.location-view-item` через кому.
- **Нулю довіряємо через дані мапи.** Лічильник «Your search returned {0}
  positions» підставляє JavaScript, у HTML числа немає. Зате скрипт сторінки
  кладе кожну вакансію з геолокацією в `SG.allJobLocations` з `postingId`: кожен
  такий ID має бути серед карток, інакше `unreadable`. На всіх 7 дошках множини
  збіглися повністю. Сторінка без `SG.allJobLocations` - теж `unreadable`.
  **Дошки без вакансій не знайшлося**, тож нуль перевірено лише тестом: якщо
  справжня порожня дошка виглядає інакше, вона дасть `unreadable`, а не нуль.
- **Невідома компанія** - 404. Сайту компанії сторінка не показує (зовнішніх
  посилань немає), тож належність не перевіряється.

**Кар'єрний сайт `https://{company}.career.softgarden.de`** (softgarden, SpiNNcloud,
BEE Partment, Crown) - фід schema.org `DataFeed` на `/jobs.feed.json` (на нього
посилається сама сторінка).

- **Один запит:** усі вакансії з описами; Crown (111) - 716 КБ.
- **Фід цілий, коли `numberOfItems` дорівнює кількості `dataFeedElement`.**
- **Поля:** `externalId` - `identifier.value` (він же в `/jobs/{id}/...`), назва -
  `title`, посилання - `url` як є (у Crown веде на інший субдомен,
  `crown.career.softgarden.de`), локація - місто (або регіон) і країна кожного
  `jobLocation` (буває обʼєкт, за схемою - і масив), кілька місць - через «; ».
  Порожні частини адреси softgarden заповнює `-`, вони відкидаються.
- **Невідомий сайт - 400** `{"errorMessage":"No such client for domain ..."}`, а
  не 404. У запиту без параметрів інших 400 не буває, тож це `not-found`.
- **Сайт компанії** - логотип у шапці (`HeaderLogo__BrandLink-...`, клас від
  styled-components): за ним перевіряється належність (`src/server/discovery/ownership.ts`).

Перевірено на справжній мережі (вручну, 19.11.2026): Kraftanlagen з кореня дошки -
85 вакансій, Sikla з `/de/vacancies` - 29, Crown - 111, BEE Partment - 30, неіснуючі
дошка й сайт - `not-found`; за назвою Nuvisan знаходить свою стару дошку (8
вакансій), належність BEE Partment до `beepartment.com` підтверджена логотипом.

## Власна сторінка

Задача 6.21, рішення автора 20.11.2026. Сторінка компанії, яку не розпізнала жодна
платформа (`unsupported`), читається, коли людина підтвердить, які посилання на ній -
вакансії: кнопка Read as list у картці компанії. Рецепт - префікс адрес вакансій,
`career_sources.vacancy_link_prefix`; платформа джерела стає `own_page`.

**Чому форма адреси, а не CSS-класи.** Конструктори сайтів міняють класи після
кожної публікації (Framer - `framer-1wbyw24`), а адреси вакансій лишаються. Рецепт
`kinggroup.io/vacancies/design/` - це «посилання з цим хостом і шляхом плюс ще один
сегмент».

**Пошук груп** (`findLinkGroups`): посилання того самого хоста, крім `nav`, `header`,
`footer`, якорів, пошти й самої сторінки, групуються за префіксом. Перша -
найімовірніша:

1. **глибша за сторінку** - вакансії `/vacancies/design/<slug>` зі сторінки
   `/vacancies/tech`, а категорії `/vacancies/hr` того самого рівня;
2. **з кар'єрним словом** у шляху (`career`, `job`, `vacanc`, `ваканс`…);
3. **більша**.

Групи без жодної з перших двох ознак (меню, послуги) показуються, лише якщо інших
немає. Діалог показує до трьох (`MAX_LINK_GROUPS`).

**Назва вакансії** береться з «картки» - найбільшого предка посилання, у якому всі
посилання ведуть на ту саму вакансію. По черзі:

| Джерело назви | Де трапилось |
| --- | --- |
| Заголовок `h1-h6` | kinggroup (Framer: `h2` у посиланні), delasport (`h3` поруч із «View & Apply») |
| Елемент із класом назви (`title`, `position`, `name`) | ncube (`vacancies__title`, посилання порожнє), a-listware (`career-item__position` серед напрямку й локації) |
| Власний текст посилання в один рядок | headway (Teamtailor: назва - посилання, відділ нижче довший) |
| Перший рядок картки | codebridge (клас `career-postiton` з помилкою, опис нижче довший) |
| Кінець адреси | порожня картка: `senior-react-developer` → «senior react developer» |

Текст кнопок («View & Apply», «See more», «Детальніше») назвою не буває. Локація не
береться (рішення автора): у кожного сайту вона в іншому місці, і вгадана була б то
напрямком, то кнопкою.

**Перевірено на 13 справжніх сторінках** з аналізу 20.11.2026 (kinggroup, a-listware,
xenoss, eleks, intellias, ncube, codebridge, delasport, bspark, avenga, headway,
boosters, growe): найімовірніша група й назви правильні на всіх. У тести взято
чотири, що покривають різні джерела назви.

**Читання** (`readOwnPage`): одна сторінка, `externalId: null` - ключ вакансії
складається з адреси. **Нуль вакансій за рецептом - `unreadable`**, а не порожній
список: інакше переробка сайту «закрила» б усі вакансії компанії. Пагінації немає: на
жодній із 13 сторінок її не було в HTML, а Load more довантажує JavaScript - тож
читається те, що видно, і саме тому автор дає адреси вже з фільтрами.

Відносні посилання розв'язуються від адреси після редиректів (або `<base href>`) і
під час пошуку груп, і під час читання, тож префікси збігаються.

