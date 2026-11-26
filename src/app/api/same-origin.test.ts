import { describe, expect, it } from "vitest";

import { isSameOriginRequest } from "./same-origin";

function request(headers: Record<string, string>): Headers {
  return new Headers({ host: "127.0.0.1:3000", ...headers });
}

describe("isSameOriginRequest", () => {
  it("accepts a fetch from our own page", () => {
    // The browser does not send Origin with a GET from the same page, but it does
    // send Sec-Fetch-Site.
    expect(
      isSameOriginRequest(request({ "sec-fetch-site": "same-origin" })),
    ).toBe(true);
  });

  it("accepts an address typed by the user", () => {
    expect(isSameOriginRequest(request({ "sec-fetch-site": "none" }))).toBe(
      true,
    );
  });

  it("refuses requests started by another site or another local port", () => {
    for (const site of ["cross-site", "same-site"]) {
      expect(isSameOriginRequest(request({ "sec-fetch-site": site }))).toBe(
        false,
      );
    }
  });

  it("falls back to Origin when the browser sends no Sec-Fetch-Site", () => {
    expect(
      isSameOriginRequest(request({ origin: "http://127.0.0.1:3000" })),
    ).toBe(true);
    expect(
      isSameOriginRequest(request({ origin: "https://evil.example" })),
    ).toBe(false);
    expect(isSameOriginRequest(request({ origin: "null" }))).toBe(false);
  });

  it("trusts Sec-Fetch-Site over a matching Origin", () => {
    expect(
      isSameOriginRequest(
        request({
          "sec-fetch-site": "cross-site",
          origin: "http://127.0.0.1:3000",
        }),
      ),
    ).toBe(false);
  });

  it("accepts a request that is not from a browser at all", () => {
    // curl or a script on this machine: neither header. The server listens only
    // on 127.0.0.1 anyway.
    expect(isSameOriginRequest(request({}))).toBe(true);
  });
});
