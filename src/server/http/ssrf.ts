/**
 * Захист від SSRF: сервер ходить лише на публічні адреси http/https
 * (docs/security.md, розділ 13, пункт 3).
 */

export type UrlRefusal = "invalid-url" | "scheme" | "local-host";

export type UrlCheck =
  { ok: true; url: URL } | { ok: false; reason: UrlRefusal };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Чи можна сервер пустити за цією адресою, - до будь-якого запиту.
 *
 * Повертає вже розібраний `URL`, щоб далі працювали саме з ним, а не з рядком:
 * перевірене й використане мають бути одним і тим самим.
 */
export function checkUrl(input: string): UrlCheck {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: "scheme" };
  }

  if (isLocalHostName(url.hostname)) {
    return { ok: false, reason: "local-host" };
  }

  return { ok: true, url };
}

/**
 * `localhost` і будь-який його піддомен. RFC 6761, розділ 6.3: «address
 * queries for localhost names will always resolve to the respective IP loopback
 * address» - і для «any names falling within ".localhost."». Відхиляємо за
 * іменем, не чекаючи DNS: резолверу лише рекомендовано (SHOULD) так робити.
 * `URL` уже привів хост до нижнього регістру; кінцеву крапку (`localhost.` -
 * повне доменне імʼя) прибираємо самі.
 */
function isLocalHostName(hostname: string): boolean {
  const name = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  return name === "localhost" || name.endsWith(".localhost");
}
