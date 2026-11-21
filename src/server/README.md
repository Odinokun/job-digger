# src/server - серверна частина

Тут живе весь серверний код застосунку, окремо від сторінок і компонентів у
[`src/app`](../app) ([`CLAUDE.md`](../../CLAUDE.md#структура-репозиторію)).

Правило: модулі з `src/server` не імпортуються в клієнтські компоненти напряму.
Клієнт звертається до сервера лише через Server Actions або серверні компоненти.

Підпапки:

- [`db`](db/README.md) - схема, підключення до PostgreSQL, міграції й seed.
- [`companies`](companies/README.md) - пошук дублікатів, списки компаній і додавання.
  Робота з самим рядком адреси - поза `src/server`, у
  [`lib/companies`](../lib/companies/README.md): вона потрібна й клієнтові.
- [`parsers`](parsers/README.md) - парсери вакансій платформ і власної сторінки за рецептом.
- [`vacancies`](vacancies/README.md) - ключ вакансії і її життєвий цикл.
- [`checks`](checks/README.md) - перевірки: Check now, Check all, Find new pages, автоперевірка, History, Failed Sources Drawer.
- [`queue`](queue/README.md) - черга перевірок у PostgreSQL: захоплення завдань,
  їхній результат, повернення завислих і завершення запусків.
- [`discovery`](discovery/README.md) - пошук кар'єрних сторінок компанії за адресою її сайту.
- [`csv`](csv/README.md) - CSV компаній для Export і Import у Settings.
- [`settings`](settings/README.md) - налаштування користувача в базі: інтервал автоперевірки.
- [`autostart`](autostart/README.md) - автозапуск робочого екземпляра при вході в macOS.
- [`http`](http/README.md) - зовнішні запити: єдиний HTTP-клієнт із ввічливістю до
  сайтів, захист від SSRF і фейковий вебсервер для тестів.

Нові підпапки створюються у своїх задачах, а не наперед.
