import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXPORT_OPTIONS,
  exportCsvHref,
  parseExportOptions,
} from "./export-options";

describe("export options", () => {
  it("starts with both lists and without career URLs", () => {
    expect(DEFAULT_EXPORT_OPTIONS).toEqual({
      tracked: true,
      notTracked: true,
      careerUrls: false,
    });
  });

  it("travels through the address and comes back the same", () => {
    const options = { tracked: false, notTracked: true, careerUrls: true };
    const href = exportCsvHref(options);

    expect(href).toBe("/api/companies-csv?notTracked=1&careerUrls=1");
    expect(
      parseExportOptions(new URL(href, "http://127.0.0.1").searchParams),
    ).toEqual(options);
  });

  it("reads anything but 1 as off", () => {
    // The address can be typed by hand: an unknown value means the option is off.
    expect(
      parseExportOptions(new URLSearchParams("tracked=yes&careerUrls=1")),
    ).toEqual({ tracked: false, notTracked: false, careerUrls: true });
  });
});
