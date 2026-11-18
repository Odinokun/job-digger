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
| `shared.ts`          | Спільне для парсерів: `collectVacancies` (правило кривих записів), `fetchJson` і `postJson` (запит → статус → JSON), `UNREADABLE`, `isRecord`, `isWebUrl` |
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
| `read-source.ts`     | `readSource(source, client)` - парсер за платформою джерела; `null`, якщо парсера ще немає |

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
близько 2 МБ за раз, до 5 сторінок. Неповна сторінка - остання; повна - ще один
запит, що прийде порожнім. Досягнення ліміту сторінок - успіх (задача 3.12 зробить
ліміт налаштуванням). Збій будь-якої сторінки - збій усього джерела.

**Lever сортує не за датою** (перевірено на Palantir і демо-сайті), тож на сайті з
понад 500 вакансіями ті, що за межею ліміту, щоразу випадатимуть - відомий і
прийнятий ризик ліміту сторінок (задача 3.12).

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
- **Сторінки по 20.** Більше Workday не приймає: `limit: 50` - 400. Ліміт - 5
  сторінок, тобто **щонайбільше 100 вакансій** з джерела (у NVIDIA їх понад 2000).
  Перша сторінка, схоже, починається з найновіших («Posted Today»), але порядок не
  строгий і ніде не описаний. Ліміт сторінок стане налаштуванням у задачі 3.12.
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
