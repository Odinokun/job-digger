# Переклад src/lib, e2e і конфігів

**Поза етапами — документація** · без тестів; `npm test`, lint, typecheck і E2E зелені

Частина [public-repo-polish.md](public-repo-polish.md). README і коментарі в `src/lib`, `src/i18n`, `e2e/`, конфігах у корені (`playwright.config.ts`, `vitest.config.ts`, `eslint.config.mjs` тощо) і в `.github/workflows` - англійською.

Сюди ж те, що пропустили попередні задачі (знайдено 27.11.2026, рішення автора):

- коментарі в `src/app/globals.css` (≈112 рядків) - `translate-app` перекладала лише `.ts`/`.tsx`;
- `src/app/theme-candidates.md` - увесь файл;
- корінь `src`: `src/instrumentation.ts`, `src/readme-coverage.test.ts`;
- конфіги в корені з українськими коментарями: `docker-compose.yml`, `next.config.ts`, `drizzle.config.ts`, `.gitignore`, `.prettierignore`, `.env.example`, `.github/dependabot.yml`.

## Кроки

- [x] README у `src/lib` англійською і посилання на нові якорі
- [x] Коментарі в коді `src/lib`
- [x] `src/i18n` і корінь `src`
- [x] `e2e/`
- [x] Конфіги в корені і `.github`
- [x] Коментарі в `src/app/globals.css`
- [x] `src/app/theme-candidates.md`

PR: #166
