/**
 * Парсер Greenhouse: вакансії з публічного Job Board API
 * (https://docs.greenhouse.io/job-board.html).
 */

/**
 * Хости, на яких Greenhouse показує дошки. Регіону ЄС тут немає свідомо:
 * підтвердженого API для нього немає (tasks/3.06-greenhouse-parser.md).
 */
const BOARD_HOSTS = new Set([
  "job-boards.greenhouse.io",
  "boards.greenhouse.io",
]);

/**
 * Назва дошки (board token) з адреси джерела або `null`, якщо адреса - не
 * дошка Greenhouse. Розуміє саму дошку (`/discord`), посилання на вакансію
 * (`/discord/jobs/123`) і вбудовану дошку (`/embed/job_board?for=discord`).
 */
export function greenhouseBoardToken(sourceUrl: string): string | null {
  let url: URL;

  try {
    url = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (!BOARD_HOSTS.has(url.hostname)) {
    return null;
  }

  const [first] = url.pathname.split("/").filter(Boolean);

  if (first === "embed") {
    return url.searchParams.get("for") || null;
  }

  return first ?? null;
}
