import { describe, expect, it } from "vitest";

import { checkUrl } from "./ssrf.ts";

describe("checkUrl", () => {
  it("allows a public https address and returns it parsed", () => {
    const result = checkUrl(
      "https://boards-api.greenhouse.io/v1/boards/discord/jobs",
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.url.hostname).toBe("boards-api.greenhouse.io");
  });

  it("allows plain http", () => {
    expect(checkUrl("http://example.com/careers").ok).toBe(true);
  });

  it("refuses schemes other than http and https", () => {
    expect(checkUrl("ftp://example.com/jobs")).toEqual({
      ok: false,
      reason: "scheme",
    });
    expect(checkUrl("file:///etc/passwd")).toEqual({
      ok: false,
      reason: "scheme",
    });
  });

  it("refuses localhost in any spelling", () => {
    for (const address of [
      "http://localhost/",
      "http://LOCALHOST./",
      "http://api.localhost:3000/",
    ]) {
      expect(checkUrl(address), address).toEqual({
        ok: false,
        reason: "local-host",
      });
    }
  });

  it("allows a public domain that only starts with localhost", () => {
    expect(checkUrl("http://localhost.example.com/").ok).toBe(true);
  });

  it("refuses an IP address from a private or special network", () => {
    for (const address of [
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      // Метадані хмари - класична ціль SSRF.
      "http://169.254.169.254/latest/meta-data/",
      "http://0.0.0.0/",
      "http://100.64.0.1/",
      // Ті самі адреси в записах, які `URL` зводить до звичайного вигляду.
      "http://2130706433/",
      "http://0x7f.1/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      // IPv4, загорнута в IPv6.
      "http://[::ffff:127.0.0.1]/",
      // IPv6-адреси з вкладеною IPv4 10.0.0.1: NAT64, 6to4, Teredo.
      "http://[64:ff9b::a00:1]/",
      "http://[2002:a00:1::1]/",
      "http://[2001::a00:1]/",
      // Застарілий 6to4 relay і документаційний префікс IPv6 3fff::/20.
      "http://192.88.99.2/",
      "http://[3fff::1]/",
    ]) {
      expect(checkUrl(address), address).toEqual({
        ok: false,
        reason: "private-ip",
      });
    }
  });

  it("allows a public IP address", () => {
    expect(checkUrl("http://8.8.8.8/").ok).toBe(true);
    expect(checkUrl("http://[2606:4700::1111]/").ok).toBe(true);
  });

  it("refuses a string that is not an address", () => {
    expect(checkUrl("не адреса")).toEqual({
      ok: false,
      reason: "invalid-url",
    });
  });
});
