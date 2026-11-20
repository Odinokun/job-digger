# src/server/autostart - автозапуск робочого екземпляра

Робочий екземпляр (клон у `~/code/job-digger-app`, README, розділ «Робочий екземпляр») стартує сам при вході в macOS - через LaunchAgent вбудованого `launchd`, без нових залежностей (задача [6.10](../../../tasks/6.10-autostart-on-login.md)). Як користуватися - [README](../../../README.md#автозапуск).

| Файл                   | Що в ньому                                                                   |
| ---------------------- | ---------------------------------------------------------------------------- |
| `launch-agent.ts`      | `launchAgentPlist` - опис задачі для `launchd` (plist), `AUTOSTART_LABEL`     |
| `launch-agent.test.ts` | Що саме потрапляє в plist                                                    |
| `autostart.ts`         | Раннер: `npm run autostart:on`, `autostart:off`, `app:restart`               |

## Як влаштовано

- Задача `local.job-digger.app` у `~/Library/LaunchAgents`. Префікс `local.` - бо домену, як у звичних `com.example.*`, у проєкту немає.
- Команда задачі: чекати, поки `pg_isready` у контейнері `job-digger-db` відповість, потім `exec npm run app` (копія бази раз на добу і `next start` на 3100). Docker Desktop після входу в систему стартує не одразу.
- `KeepAlive` → `SuccessfulExit: false`: `launchd` перезапускає сервер лише після виходу з помилкою (падіння, невдала копія), не частіше ніж раз на 60 с (`ThrottleInterval`). Ключ заразом запускає задачу при завантаженні.
- `launchd` не читає `~/.zshrc`, тож `PATH` задачі записується при `autostart:on`: тека `node`, яким запущено скрипт (nvm), і тека `docker`. Після зміни версії Node - `npm run autostart:on` ще раз.
- Лог сервера - `~/Library/Logs/job-digger/app.log` (stdout і stderr разом).

Перевірено наживо 20.11.2026 тимчасовою задачею з іншою назвою й портом: старт через `bootstrap`, відповідь сервера, `kickstart -k` (новий процес, старий зник), `bootout` (порт вільний, ні `npm`, ні `next-server` не лишилось), копія в iCloud із процесу `launchd` - вона працює лише після дозволу у вікні macOS, яке зʼявляється при першій спробі, а до відповіді процес чекає. Очікування бази при вимкненому Docker наживо не перевірялось.
