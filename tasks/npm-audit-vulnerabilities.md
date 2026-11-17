# Розібратися з уразливостями у npm audit

**Поза етапами — залежності й CI**

`npm audit` показує попередження у dev-залежностях: у рантайм застосунку вони не потрапляють, але рішення варто ухвалити й записати, а не гортати попередження щоразу.

**Два кластери:**

1. **minimatch 7.0.0 – 11.0.0** — [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), відмова в обслуговуванні через globparts amplification. Приходить із `eslint@10.14.0`, `@eslint/config-array` і `@typescript-eslint/*`. `npm audit` каже, що тут фікс доступний без breaking changes.

2. **esbuild <=0.24.2** — [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99): будь-який сайт може надсилати запити до dev-сервера esbuild і читати відповідь. Ланцюжок: `drizzle-kit@0.31.11` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → старий `esbuild`. Простого фіксу немає: 0.31.11 — остання версія drizzle-kit, і вона досі залежить від `@esbuild-kit/esm-loader`, хоча цей пакет deprecated на користь `tsx` (сам `tsx` у залежностях drizzle-kit теж є). `npm audit fix --force` відкотив би drizzle-kit до 0.18.1 — це гірше за саму проблему.

**Рішення 17.11.2026 (розбір колонки Analyze):**

- **minimatch** — `npm audit fix`. Команда змінює `package-lock.json`, а `protect-files.sh` блокує Write/Edit у нього (але не Bash): отже це запуск команди, а не правка файлу руками, і в коміт іде лише те, що змінив сам npm.
- **esbuild у ланцюжку drizzle-kit** — приймаємо ризик і записуємо причину в README: advisory про dev-сервер esbuild, якого ми не запускаємо (drizzle-kit використовує esbuild для разової трансформації файлів схеми). Перед тим як записати це рішення, advisory треба перечитати й підтвердити саме це твердження — поки воно гіпотеза. `overrides` на версію esbuild не ставимо: виграш нульовий, а ризик зламати drizzle-kit реальний.
- **CI** — додаємо `npm audit --audit-level=high`, щоб нові дірки було видно, а moderate у dev-залежностях не блокували PR.

**Кроки:** `npm audit fix` для minimatch → перечитати GHSA-67mh-4wv8-2f99 і зафіксувати рішення в README → `npm audit --audit-level=high` у GitHub Actions.

**Уточнення 17.11.2026 (під час 2.06): з’явився третій кластер, уже high.** Було 13 moderate, стало 12 moderate + 12 high. Причина не в нових залежностях — `@gravity-ui/icons` додав у lock рівно один рядок і нічого не зачепив; змінилася база advisory.

Усі 12 high — один корінь: **picomatch <=4.0.7**, [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), ReDoS. Решта — те, що його тягне: `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`, `fdir` → `tinyglobby` → `vite` → `vitest` і `@typescript-eslint/typescript-estree`, а також `@parcel/watcher`.

**Наслідок для плану:** `npm audit --audit-level=high` у CI зараз падатиме. Спершу треба розібратися з picomatch (чи є фікс без breaking changes), і лише потім ставити цю перевірку в Actions — інакше вона заблокує кожен PR.

Знайдено під час 1.15.
