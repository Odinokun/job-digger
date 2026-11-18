import { describe, expect, it } from "vitest";

import { cleanVacancyUrl, vacancyKey } from "./key.ts";

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

describe("vacancyKey", () => {
  it("uses the platform id when there is one", () => {
    expect(
      vacancyKey({
        externalId: "8927168002",
        url: "https://job-boards.greenhouse.io/discord/jobs/8927168002",
      }),
    ).toBe("id:8927168002");
  });

  it("falls back to the cleaned address without an id", () => {
    for (const externalId of [null, "", "  "]) {
      expect(
        vacancyKey({
          externalId,
          url: "https://acme.com/jobs/1/?utm_source=x",
        }),
      ).toBe("url:https://acme.com/jobs/1");
    }
  });

  it("gives one key to two addresses of one vacancy", () => {
    expect(
      vacancyKey({ externalId: null, url: "https://acme.com/jobs/1?gclid=a" }),
    ).toBe(
      vacancyKey({ externalId: null, url: "https://ACME.com/jobs/1/#apply" }),
    );
  });

  it("ignores the address when the id is known", () => {
    // Адреса вакансії з ID може змінитися - це та сама вакансія (розділ 7).
    expect(vacancyKey({ externalId: "42", url: "https://acme.com/old" })).toBe(
      vacancyKey({ externalId: "42", url: "https://acme.com/new" }),
    );
  });
});
