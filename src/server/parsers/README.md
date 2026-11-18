# src/server/parsers - парсери вакансій

Читають вакансії з кар'єрних джерел: публічних API платформ (ATS), а згодом і
розмітки schema.org JobPosting ([docs/discovery-and-parsing.md](../../../docs/discovery-and-parsing.md),
розділ 6). Усі запити - через єдиний HTTP-клієнт ([`src/server/http`](../http/README.md)).

## Файли

| Файл                 | Роль                                             |
| -------------------- | ------------------------------------------------ |
| `types.ts`           | Спільний формат: `ParsedVacancy`, `ParseResult`, `ParserError` |
| `greenhouse.ts`      | Greenhouse: `readGreenhouse(sourceUrl, client)` і його частини |
| `greenhouse.test.ts` | Юніт-тести парсера Greenhouse                     |
| `greenhouse.integration.test.ts` | `readGreenhouse` через фейковий вебсервер |

## Спільний формат

Парсер повертає `{ ok: true, vacancies }` або `{ ok: false, error }` (`types.ts`).

- **Вакансія** - `externalId` (ID на платформі, з нього складається ключ), `title`,
  `url` (лише http/https) і `location` (може бути `null` - тоді в списку «—»).
- **Помилки:** `not-found` (сторінки чи дошки немає, 404), `unreadable` (відповідь не
  того формату або адреса не та), `bad-status` (сайт відповів інакше, ніж 2xx чи 404,
  - зі статусом), `fetch-failed` (збій запиту, з причиною `HttpError`).
- **Крива хоч одна вакансія - невдала вся відповідь.** Не пропускаємо її поодинці:
  якби змінився формат, пропущеними виявились би всі, і порожній список закрив би
  всі вакансії джерела. Невдала перевірка вакансій не чіпає.
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
