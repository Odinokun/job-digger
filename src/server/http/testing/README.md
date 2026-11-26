# src/server/http/testing - фейковий вебсервер

Тести ніколи не ходять на справжні сайти ([CLAUDE.md](../../../../CLAUDE.md#тести-і-tdd)).
Замість платформ і сайтів компаній їм відповідає локальний сервер зі збереженими
справжніми відповідями.

## Файли

| Файл                           | Роль                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `fake-web.ts`                  | `startFakeWeb({ root, port })` - сервер на `127.0.0.1`      |
| `fake-web.integration.test.ts` | Віддача файлу, ігнорування рядка запиту, 404, вихід за теку |
| `serve-fake-web.ts`            | Запуск окремим процесом: `node serve-fake-web.ts <port>`, віддає `responses/` - так його піднімає Playwright для E2E |

## Схема адрес

Домен стає першою частиною шляху:

```
https://boards-api.greenhouse.io/v1/boards/acme/jobs
→ {origin фейкового сервера}/boards-api.greenhouse.io/v1/boards/acme/jobs
→ файл {root}/boards-api.greenhouse.io/v1/boards/acme/jobs
```

- **Шлях на `/` - файл `index` у теці.** Корінь сайту `https://acme.example`
  клієнт перетворює на `/acme.example/`, а тека файлом бути не може, тож
  відповідь лежить у `responses/acme.example/index`.
- **Рядок запиту ігнорується.** Відповідь визначає лише шлях: `?content=true` і
  без нього віддають той самий файл.
- **Немає файлу - 404.** Так тести бачать і відсутню сторінку платформи.
- **Тип вмісту - за першим символом файлу:** `{` або `[` - JSON, `<` - HTML,
  решта - текст. Розширень у файлів зазвичай немає, бо назва повторює шлях
  платформи (`.../jobs`).
- **За межі `root` не вийти.** Шлях декодується, а потім перевіряється, що файл
  лежить усередині `root`: інакше `..%2f` (закодований слеш) дістав би файл поза
  текою. Тест робить сирий запит через `node:http`, бо `fetch` нормалізує `..` і
  `%2e%2e` ще до відправки й до сервера їх не доносить.

## Збережені відповіді

Лежать у `responses/` за тією самою схемою адрес. Це справжні відповіді платформ,
збережені як є, без правок: тести парсерів мають бачити те, що платформа віддає
насправді, разом із полями, яких немає в її документації.

Це копії публічних сторінок і відповідей API, збережені лише для тестів. Вміст
належить їхнім власникам (компаніям і платформам) і під ліцензію MIT проєкту не
підпадає.

| Файл | Звідки | Коли |
| ---- | ------ | ---- |
| `responses/boards-api.greenhouse.io/v1/boards/discord/jobs` | Greenhouse Job Board API, дошка Discord, без `content=true` (26 вакансій) | 18.11.2026 |
| `responses/api.lever.co/v0/postings/leverdemo` | Lever Postings API, демо-сайт самого Lever, `mode=json` (10 вакансій, 83 КБ) | 18.11.2026 |
| `responses/api.ashbyhq.com/posting-api/job-board/linear` | Ashby Job Postings API, дошка Linear (33 вакансії, 468 КБ - описи вакансій API віддає завжди) | 18.11.2026 |
| `responses/nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs` | Workday, сайт NVIDIA, POST з `searchText: "Warsaw"` - 11 вакансій, одна сторінка. Фейковий сервер тіло запиту не читає, тож на будь-який POST сюди віддає цей файл | 18.11.2026 |
| `responses/jobs.ashbyhq.com/linear` | Сторінка дошки Ashby Linear для людей, HTML 26 КБ: дошку малює JavaScript, а сайт організації (`publicWebsite: linear.app`) лежить у JSON сторінки | 19.11.2026 |
| `responses/team.peopleforce.io/careers` | Сторінка кар'єри самої PeopleForce, HTML (6 вакансій, одна сторінка) | 18.11.2026 |
| `responses/webellian.peopleforce.io/careers` | Сторінка кар'єри Webellian на PeopleForce, `?page=1` - 10 вакансій з 23, є посилання на наступну сторінку | 18.11.2026 |
| `responses/peopleforce.softconstruct.com/careers` | PeopleForce на домені компанії, SoftConstruct, `?page=1` - 10 вакансій з 215 (515 КБ - фільтр на сотні відділів). Старіша розмітка: у посилання «далі» немає `rel="next"` (задача 5.13) | 21.11.2026 |
| `responses/breezy.breezy.hr/json` | Публічний JSON дошки самої Breezy HR (3 вакансії) | 19.11.2026 |
| `responses/jobs.breezy.hr/json` | Публічний JSON другої дошки Breezy HR: одна віддалена вакансія (`is_remote: true`) | 19.11.2026 |
| `responses/cleverstaff.net/hr/public/getAllOpenVacancy` | CleverStaff, дошка 8allocate (8 віддалених вакансій, з описами - 196 КБ). Рядок запиту сервер ігнорує, тож це відповідь на будь-який аліас | 19.11.2026 |
| `responses/spribe.hurma.work/api/v1/public-vacancies` | Hurma, дошка Spribe, `per_page=100&page=1` (6 вакансій, одна сторінка; в одної є `residence`, в одної - `work_format: "Remote"`). Без заголовка `X-Requested-With` справжній API дає 403, фейковий сервер заголовків не читає | 19.11.2026 |
| `responses/astrafy.jobs.personio.de/xml` | XML-фід Personio, дошка Astrafy (4 вакансії з описами, 27 КБ; у двох є `additionalOffices`). Сервер віддає його як HTML, бо файл починається з `<` - парсер на тип вмісту не дивиться | 19.11.2026 |
| `responses/dps.softgarden.io/en/vacancies` | Стара дошка softgarden, DPS: серверний HTML з усіма 19 вакансіями (сторінки малює JavaScript), локації картки - кілька `location-view-item`, ID ще й у `SG.allJobLocations` | 19.11.2026 |
| `responses/altenar.bamboohr.com/careers/list` | JSON кар'єрної сторінки BambooHR, компанія Altenar (12 вакансій; в одної порожнє `location`, місце - в `atsLocation`) | 20.11.2026 |
| `responses/gig.pinpointhq.com/postings.json` | JSON кар'єрної сторінки Pinpoint, компанія GiG (16 вакансій з описами, 100 КБ; одна позиція в кількох містах) | 20.11.2026 |
| `responses/ats.talentadore.com/positions/rR1TqSR/json` | JSON віджета TalentAdore, ELK Studios (3 вакансії; місто й країна плюс адреса офісу в `location`) | 20.11.2026 |
| `responses/apply.workable.com/api/v1/widget/accounts/goreel` | JSON віджета Workable, акаунт GoReel (3 вакансії з описом компанії) | 20.11.2026 |
| `responses/kinggroup.io/vacancies/tech` | Власна сторінка kinggroup на Framer, напрямок Tech: 10 вакансій посиланнями `./design/<slug>`, назва - `h2` у посиланні (221 КБ) | 20.11.2026 |
| `responses/www.delasport.com/careers/index` | Власна сторінка delasport (WordPress): 6 вакансій, посилання «View & Apply», назва - `h3` у картці | 20.11.2026 |
| `responses/ncube.com/career` | Власна сторінка ncube (WordPress): 12 вакансій, порожні посилання, назва - `div.vacancies__title` | 20.11.2026 |
| `responses/a-listware.com/career` | Власна сторінка a-listware (WordPress): 30 вакансій, картка-посилання з напрямком, назвою (`career-item__position`) і локацією | 20.11.2026 |
| `responses/spinncloud.career.softgarden.de/jobs.feed.json` | Новий кар'єрний сайт softgarden, SpiNNcloud: фід schema.org `DataFeed` (6 вакансій з описами, 67 КБ); в одної адреса з `-` замість міста | 19.11.2026 |
| `responses/cleverstaff.net/hr/public/getVacancy` | CleverStaff, вакансія 8allocate `3ONpJV`: з неї парсер дізнається аліас компанії | 19.11.2026 |

**Сайти компаній - синтетичні** (рішення автора 19.11.2026, задача 5.02). Пошук
кар'єрних сторінок читає головні сторінки компаній, і справжня сторінка тягнула б
сотні КБ розмітки та скриптів, а тест залежав би від того, як сайт виглядав у день
збереження. Тому сторінки компаній лежать на зарезервованих доменах `.example`
(RFC 2606) і містять лише те, що перевіряє тест. Платформ це не стосується: їхні
відповіді лишаються справжніми.

| Файл | Що на сторінці | Для чого |
| ---- | -------------- | -------- |
| `responses/globex.example/` | Головна з посиланням «Karriere»; `/de/karriere` вбудовує дошку Greenhouse `discord` скриптом | Кар'єрна сторінка за посиланням (5.03) |
| `responses/initech.example/` | Головна без кар'єрних посилань; `/careers` - власна сторінка без ATS | Типові адреси (5.03) |
| `responses/umbrella.example/` | Ні посилань, ні `/careers`; `sitemap.xml` веде на `/en/jobs`, звідти посилання на Ashby `linear` | Sitemap (5.03) |
| `responses/wayne.example/index` | Головна з посиланням Careers на дошку Greenhouse `ghost`, якої на сервері немає | Пробне читання, що не вдалося (5.06) |
| `responses/hooli.example/` | Головна з вакансією на Teamtailor і посиланням Careers; `/careers` веде ще на дві вакансії Teamtailor і на сайт самого Teamtailor («Powered by»). До 6.26 тут був BambooHR, але він отримав парсер | Відома ATS без парсера: одна знахідка на платформу (5.15) |
| `responses/kramerica.example/index` | Головна з посиланням Careers на `jobs.kramerica.example/careers` - це PeopleForce на піддомені сайту | PeopleForce на домені компанії: кар'єрна сторінка сама є дошкою (5.13) |
| `responses/vandelay.example/` | Головна з Careers; `/careers` - власна сторінка без ATS, що веде на `peopleforce.vandelay.example/careers` | PeopleForce на домені компанії: крок далі від кар'єрної сторінки, як у SoftConstruct (5.13) |
| `responses/acme.example/index` | Головна Acme: Careers і одна вакансія ведуть на дошку Lever `leverdemo`, плюс внутрішні посилання, LinkedIn і `mailto:` | Пошук посилань на ATS (5.02), сценарій `e2e/find-pages.spec.ts` |

Сторінки PeopleForce на піддоменах синтетичних сайтів (`jobs.kramerica.example/careers`,
`peopleforce.vandelay.example/careers`) - символьні посилання на справжню
`peopleforce.softconstruct.com/careers`: сайт синтетичний, а розмітка платформи
справжня, і без копії на 515 КБ. Сервер перевіряє, що шлях лишається в `root`,
лексично, тож посилання всередині `responses/` він віддає.

Оновити або додати відповідь - один запит до справжньої платформи, наприклад:

```bash
curl -f -o src/server/http/testing/responses/boards-api.greenhouse.io/v1/boards/discord/jobs \
  https://boards-api.greenhouse.io/v1/boards/discord/jobs
```

Після оновлення тести, що спираються на конкретні вакансії, можуть упасти: дані
на дошці змінюються. Prettier ці файли не чіпає - у них немає розширення, і
`prettier --check .` їх пропускає.

## Чому так, а не інакше

Запити застосунку потрапляють сюди не через параметри парсерів, а через одну
точку підміни в HTTP-модулі (задача 3.02): усі зовнішні запити йдуть через нього,
і в тестах він надсилає їх на цей сервер. Парсери про підміну не знають, захист від
SSRF перевіряє справжню адресу, а в мережу не йде нічого.

Не беремо MSW: він перехоплює `fetch` лише у своєму процесі, а в E2E запити робить
окремий процес застосунку. Не беремо `HTTP_PROXY`: для HTTPS знадобився б
перехоплювач TLS.
