/**
 * Захист від SSRF: сервер ходить лише на публічні адреси http/https
 * (docs/security.md, розділ 13, пункт 3).
 */

export type UrlRefusal = "invalid-url" | "scheme";

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

  return { ok: true, url };
}
