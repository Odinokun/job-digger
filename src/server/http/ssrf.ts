/**
 * Захист від SSRF: сервер ходить лише на публічні адреси http/https
 * (docs/security.md, розділ 13, пункт 3).
 */
import { BlockList, isIP } from "node:net";

export type UrlRefusal =
  | "invalid-url"
  | "scheme"
  | "local-host"
  | "private-ip";

export type UrlCheck =
  { ok: true; url: URL } | { ok: false; reason: UrlRefusal };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Мережі, куди сервер не ходить: не лише приватні, а всі, що не є звичайним
 * публічним інтернетом - петля, link-local (там живуть метадані хмари), спільний
 * простір провайдерів, документаційні, мультикаст і зарезервовані.
 *
 * Звірено з реєстрами спеціальних адрес IANA (18.11.2026): усі блоки з
 * «Globally Reachable: False» тут є.
 * https://www.iana.org/assignments/iana-ipv4-special-registry/
 * https://www.iana.org/assignments/iana-ipv6-special-registry/
 * Свідомо ширше за реєстр: NAT64 (`64:ff9b::/96`), 6to4 (`2002::/16`) і весь
 * `2001::/23` разом із Teredo - адреси з вкладеною IPv4, яка може бути
 * внутрішньою (`64:ff9b::a00:1` - це 10.0.0.1). Сайтів вакансій там не буває.
 *
 * `BlockList` застосовує правила IPv4 і до IPv4, загорнутої в IPv6
 * (`::ffff:10.0.0.1`), тому окремо такі адреси не перелічуються.
 * https://nodejs.org/api/net.html#class-netblocklist
 */
const BLOCKED_NETWORKS = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8], // «ця мережа»; 0.0.0.0 на Linux означає цю машину
  ["10.0.0.0", 8], // приватна
  ["100.64.0.0", 10], // спільний простір провайдерів (CGNAT)
  ["127.0.0.0", 8], // петля
  ["169.254.0.0", 16], // link-local, метадані хмари
  ["172.16.0.0", 12], // приватна
  ["192.0.0.0", 24], // службові призначення IETF
  ["192.0.2.0", 24], // документаційна
  ["192.88.99.0", 24], // застарілий 6to4 relay
  ["192.168.0.0", 16], // приватна
  ["198.18.0.0", 15], // тестування мереж
  ["198.51.100.0", 24], // документаційна
  ["203.0.113.0", 24], // документаційна
  ["224.0.0.0", 4], // мультикаст
  ["240.0.0.0", 4], // зарезервована, разом із 255.255.255.255
] as const) {
  BLOCKED_NETWORKS.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128], // невизначена адреса
  ["::1", 128], // петля
  ["64:ff9b::", 96], // NAT64: веде на IPv4, зокрема внутрішню
  ["64:ff9b:1::", 48], // локальний NAT64
  ["100::", 64], // лише для відкидання
  ["2001::", 23], // службові IETF, разом із Teredo (вкладена IPv4)
  ["2001:db8::", 32], // документаційна
  ["2002::", 16], // 6to4: вкладена IPv4
  ["3fff::", 20], // документаційна
  ["5f00::", 16], // Segment Routing
  ["fc00::", 7], // унікальні локальні
  ["fe80::", 10], // link-local
  ["ff00::", 8], // мультикаст
] as const) {
  BLOCKED_NETWORKS.addSubnet(network, prefix, "ipv6");
}

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

  // IPv6 у хості `URL` стоїть у квадратних дужках: `[::1]`.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");

  if (isIP(host) !== 0 && !isPublicIp(host)) {
    return { ok: false, reason: "private-ip" };
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

/**
 * Чи публічна IP-адреса. Хитрі записи (`2130706433`, `0x7f.1`) сюди не доходять:
 * `URL` уже звів їх до звичайного вигляду, а DNS повертає лише звичайний.
 */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);

  if (family === 0) {
    throw new Error(`Not an IP address: ${ip}`);
  }

  return !BLOCKED_NETWORKS.check(ip, family === 4 ? "ipv4" : "ipv6");
}
