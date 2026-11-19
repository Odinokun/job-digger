/**
 * Чи прийшов запит до API-маршруту з нашої ж сторінки. Server Actions Next
 * перевіряє сам, а звичайні маршрути - ні (docs/security.md, пункт 2).
 *
 * Спершу `Sec-Fetch-Site`: GET із тієї самої сторінки браузер шле без `Origin`
 * (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin),
 * тож перевірка самого `Origin` відкидала б наші ж опитування. `same-site`
 * відкидається теж: інша програма на іншому порту 127.0.0.1 - той самий сайт,
 * але не наша сторінка
 * (https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site).
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");

  if (site !== null) {
    // `none` - адреса, яку користувач сам ввів у рядок браузера.
    return site === "same-origin" || site === "none";
  }

  const origin = headers.get("origin");

  // Не браузер (curl, скрипт): підробити запит від імені користувача він не
  // може, а сервер слухає лише цю машину.
  if (origin === null) return true;

  try {
    return new URL(origin).host === headers.get("host");
  } catch {
    // `Origin: null` - запит із sandbox чи file://.
    return false;
  }
}
