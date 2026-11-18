# src/server/parsers - парсери вакансій

Читають вакансії з кар'єрних джерел: публічних API платформ (ATS), а згодом і
розмітки schema.org JobPosting ([docs/discovery-and-parsing.md](../../../docs/discovery-and-parsing.md),
розділ 6). Усі запити - через єдиний HTTP-клієнт ([`src/server/http`](../http/README.md)).

## Файли

| Файл                 | Роль                                             |
| -------------------- | ------------------------------------------------ |
| `greenhouse.ts`      | Greenhouse: `greenhouseBoardToken(sourceUrl)`     |
| `greenhouse.test.ts` | Юніт-тести парсера Greenhouse                     |

## Greenhouse

API - `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`, без
авторизації ([документація](https://docs.greenhouse.io/job-board.html)).

`greenhouseBoardToken` дістає назву дошки з адреси джерела в тому вигляді, як вона
лежить у `career_sources.url` (абсолютна, як ввів користувач): сама дошка
(`job-boards.greenhouse.io/discord`, `boards.greenhouse.io/discord`), посилання на
вакансію (`.../discord/jobs/123`), вбудована дошка (`/embed/job_board?for=discord`).
Не дошка Greenhouse - `null`. Хост ЄС (`job-boards.eu.greenhouse.io`) не
підтримується: підтвердженого API для нього немає.
