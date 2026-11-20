/**
 * Єдиний HTTP-клієнт застосунку. Усі зовнішні запити йдуть через нього: розклад
 * запитів до сайтів належить клієнту, і лише спільний клієнт тримає ліміт «два
 * одночасно, 2 с між стартами» на весь застосунок, а не на кожного, хто
 * створив свій.
 *
 * `FAKE_WEB_ORIGIN` задають лише тести (Playwright передає його застосунку):
 * тоді всі запити йдуть на фейковий вебсервер. Змінна має вести на цю машину,
 * інакше клієнт не створиться (src/server/http/README.md).
 */
import { createHttpClient } from "./client.ts";
import { parseRetryAttempts } from "./retry-attempts.ts";

export const httpClient = createHttpClient({
  fakeOrigin: process.env.FAKE_WEB_ORIGIN || undefined,
  retryAttempts: parseRetryAttempts(process.env.RETRY_ATTEMPTS),
});
