import { describe, expect, it } from "vitest";

import { cleanVacancyUrl } from "./key.ts";

describe("cleanVacancyUrl", () => {
  it("drops tracking marks and keeps the parameters that matter", () => {
    expect(
      cleanVacancyUrl(
        "https://acme.com/jobs/view?id=42&utm_source=linkedin&utm_campaign=x&gh_src=abc",
      ),
    ).toBe("https://acme.com/jobs/view?id=42");
  });

  it("drops the Greenhouse job id mark and ad click marks", () => {
    expect(
      cleanVacancyUrl(
        "https://boards.greenhouse.io/figma/jobs/5426468004?gh_jid=5426468004",
      ),
    ).toBe("https://boards.greenhouse.io/figma/jobs/5426468004");
    expect(cleanVacancyUrl("https://acme.com/jobs/1?fbclid=x&gclid=y")).toBe(
      "https://acme.com/jobs/1",
    );
  });

  it("drops the slash at the end of the path, the fragment and host case", () => {
    expect(cleanVacancyUrl("https://ACME.com/jobs/1/#apply")).toBe(
      "https://acme.com/jobs/1",
    );
    expect(cleanVacancyUrl("https://acme.com/")).toBe("https://acme.com");
  });

  it("gives the same address whatever the order of the parameters", () => {
    expect(cleanVacancyUrl("https://acme.com/jobs?b=2&a=1")).toBe(
      cleanVacancyUrl("https://acme.com/jobs?a=1&b=2"),
    );
  });

  it("keeps the case of the path, where it can matter", () => {
    expect(cleanVacancyUrl("https://acme.com/Jobs/Senior-Dev")).toBe(
      "https://acme.com/Jobs/Senior-Dev",
    );
  });
});
