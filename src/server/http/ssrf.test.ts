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

  it("refuses a string that is not an address", () => {
    expect(checkUrl("не адреса")).toEqual({
      ok: false,
      reason: "invalid-url",
    });
  });
});
