/**
 * SSRF protection: the server only visits public http/https addresses
 * (CLAUDE.md, "Security").
 */
import type { LookupAddress, LookupOptions } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";

export type UrlRefusal = "invalid-url" | "scheme" | "local-host" | "private-ip";

export type UrlCheck =
  { ok: true; url: URL } | { ok: false; reason: UrlRefusal };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Networks the server never visits: not only private ones but everything that
 * is not the ordinary public internet - loopback, link-local (where cloud
 * metadata lives), the shared provider space, documentation, multicast and
 * reserved ranges.
 *
 * Checked against the IANA special-purpose address registries (18.11.2026):
 * every block marked "Globally Reachable: False" is here.
 * https://www.iana.org/assignments/iana-ipv4-special-registry/
 * https://www.iana.org/assignments/iana-ipv6-special-registry/
 * Deliberately wider than the registry: NAT64 (`64:ff9b::/96`), 6to4
 * (`2002::/16`) and the whole of `2001::/23` including Teredo - addresses with an
 * embedded IPv4 that may be internal (`64:ff9b::a00:1` is 10.0.0.1). Job sites
 * never live there.
 *
 * `BlockList` applies the IPv4 rules to IPv4 wrapped in IPv6 as well
 * (`::ffff:10.0.0.1`), so such addresses are not listed separately.
 * https://nodejs.org/api/net.html#class-netblocklist
 */
const BLOCKED_NETWORKS = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8], // "this network"; on Linux 0.0.0.0 means this machine
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // shared provider space (CGNAT)
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // deprecated 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // network benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including 255.255.255.255
] as const) {
  BLOCKED_NETWORKS.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128], // unspecified address
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64: leads to IPv4, internal ones included
  ["64:ff9b:1::", 48], // local-use NAT64
  ["100::", 64], // discard-only
  ["2001::", 23], // IETF protocol assignments, including Teredo (embedded IPv4)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4: embedded IPv4
  ["3fff::", 20], // documentation
  ["5f00::", 16], // Segment Routing
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  BLOCKED_NETWORKS.addSubnet(network, prefix, "ipv6");
}

/**
 * Whether the server may be let through to this address, before any request.
 *
 * Returns the parsed `URL` so the rest of the code works with it rather than
 * with the string: what was checked and what is used must be the same thing.
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

  // In a `URL` host, IPv6 sits in square brackets: `[::1]`.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");

  if (isIP(host) !== 0 && !isPublicIp(host)) {
    return { ok: false, reason: "private-ip" };
  }

  return { ok: true, url };
}

/**
 * `localhost` and any of its subdomains. RFC 6761, section 6.3: "address
 * queries for localhost names will always resolve to the respective IP loopback
 * address" - also for "any names falling within ".localhost."". We refuse by
 * name without waiting for DNS: resolvers are only advised (SHOULD) to do so.
 * `URL` has already lower-cased the host; we strip the trailing dot
 * (`localhost.` is a fully qualified domain name) ourselves.
 */
function isLocalHostName(hostname: string): boolean {
  const name = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  return name === "localhost" || name.endsWith(".localhost");
}

/**
 * Whether an IP address is public. Tricky forms (`2130706433`, `0x7f.1`) never
 * reach here: `URL` has already normalised them, and DNS only returns normal ones.
 */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);

  if (family === 0) {
    throw new Error(`Not an IP address: ${ip}`);
  }

  return !BLOCKED_NETWORKS.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/** A DNS query: all addresses of a name. Replaced in tests. */
export type Resolve = (
  hostname: string,
  options: LookupOptions,
) => Promise<LookupAddress[]>;

const resolveWithDns: Resolve = (hostname, options) =>
  dnsLookup(hostname, { ...options, all: true as const });

/**
 * A `lookup` function for `http.request` that refuses when the domain points
 * at an internal address.
 *
 * The check runs at connection time, on the very addresses the connection
 * will use. A separate DNS check before the request would leave a window: between
 * it and the request the domain may start pointing at an internal address
 * (DNS rebinding).
 *
 * It refuses if **at least one** address is internal: otherwise the connection
 * could land on exactly that one. A DNS error is passed on unchanged.
 * https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
 */
export function createSafeLookup(resolve: Resolve): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, options).then(
      (addresses) => {
        const internal = addresses.find(({ address }) => !isPublicIp(address));

        if (internal) {
          const error: NodeJS.ErrnoException = new Error(
            `Refused to connect to ${hostname}: it resolves to the internal address ${internal.address}`,
          );
          error.code = "ERR_SSRF_PRIVATE_ADDRESS";
          callback(error, "");
          return;
        }

        // With `all: true` Node expects an array, otherwise one address and its family.
        if (options.all) {
          callback(null, addresses);
        } else {
          const [first] = addresses;
          callback(null, first.address, first.family);
        }
      },
      (error: NodeJS.ErrnoException) => callback(error, ""),
    );
  };
}

/** `lookup` with real DNS - for the HTTP module. */
export const safeLookup = createSafeLookup(resolveWithDns);
