# src/server/discovery - пошук кар'єрних сторінок

Знаходить кар'єрні джерела компанії за адресою її сайту
([docs/discovery-and-parsing.md](../../../docs/discovery-and-parsing.md), розділ 5).
Усі запити - через єдиний HTTP-клієнт ([`src/server/http`](../http/README.md)).

## Файли

| Файл                | Роль                                                          |
| ------------------- | ------------------------------------------------------------- |
| `board-url.ts`      | `boardUrlOf` - посилання на ATS (дошка, вакансія, форма відгуку, вбудована дошка) → адреса дошки й платформа |
| `board-url.test.ts` | Юніт-тести `boardUrlOf` для кожної платформи                   |

## Адреса дошки

Знахідка - завжди дошка, а не вакансія: сайт компанії часто веде одразу на
окреме оголошення чи форму відгуку, а дві вакансії однієї дошки мають дати одну
знахідку. Що вважати дошкою, визначають функції парсерів (`greenhouseBoardToken`,
`leverSite`, `ashbyBoard`, `workdaySite`, `peopleforceSite`), тож знайдене джерело
читається тим самим кодом, що й додане руками. Форма адреси одна на платформу:

| Платформа   | Адреса дошки                                   |
| ----------- | ---------------------------------------------- |
| Greenhouse  | `https://job-boards.greenhouse.io/{token}`     |
| Lever       | `https://jobs.lever.co/{site}` (ЄС - `jobs.eu.lever.co`) |
| Ashby       | `https://jobs.ashbyhq.com/{board}`             |
| Workday     | адреса career site без мови й хвоста вакансії  |
| PeopleForce | `https://{company}.peopleforce.io/careers`     |
