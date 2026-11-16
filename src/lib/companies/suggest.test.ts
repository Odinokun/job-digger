import { describe, expect, it } from "vitest";

import { suggestCompanyFields } from "./suggest.ts";

describe("suggestCompanyFields", () => {
  it("cuts the company website down to its domain", () => {
    expect(suggestCompanyFields("bosch.com/de/careers/jobs").url).toBe(
      "bosch.com",
    );
  });

  it("keeps the pasted address as the career page when it has a path", () => {
    expect(suggestCompanyFields("bosch.com/de/careers/jobs").careerUrl).toBe(
      "bosch.com/de/careers/jobs",
    );
  });

  it("leaves the career page empty for a bare domain", () => {
    expect(suggestCompanyFields("https://www.Bosch.com/")).toEqual({
      url: "bosch.com",
      name: "Bosch",
      careerUrl: "",
    });
  });

  it("names the company after the domain label before the public suffix", () => {
    expect(suggestCompanyFields("about.gitlab.com").name).toBe("Gitlab");
  });

  it("skips a second-level suffix when naming the company", () => {
    expect(suggestCompanyFields("bosch.com.ua").name).toBe("Bosch");
    expect(suggestCompanyFields("bbc.co.uk").name).toBe("Bbc");
  });

  it("turns separators in the domain label into words", () => {
    expect(suggestCompanyFields("acme-corp.com").name).toBe("Acme Corp");
  });

  it("uses the whole host when it has a single label", () => {
    expect(suggestCompanyFields("intranet").name).toBe("Intranet");
  });

  it("suggests nothing when the address cannot be used", () => {
    const nothing = { url: "", name: "", careerUrl: "" };

    expect(suggestCompanyFields("")).toEqual(nothing);
    expect(suggestCompanyFields("не адреса")).toEqual(nothing);
    expect(suggestCompanyFields("ftp://bosch.com")).toEqual(nothing);
  });

  describe("an address on a known ATS", () => {
    it("takes the company name from the path slug", () => {
      expect(suggestCompanyFields("jobs.lever.co/spotify").name).toBe(
        "Spotify",
      );
      expect(
        suggestCompanyFields("https://job-boards.greenhouse.io/acme-corp").name,
      ).toBe("Acme Corp");
      expect(suggestCompanyFields("jobs.ashbyhq.com/openai/jobs").name).toBe(
        "Openai",
      );
    });

    it("takes the company name from the subdomain where the slug lives there", () => {
      expect(
        suggestCompanyFields("bosch.wd3.myworkdayjobs.com/en-US/External").name,
      ).toBe("Bosch");
      expect(suggestCompanyFields("acme.peopleforce.io/careers").name).toBe(
        "Acme",
      );
    });

    it("suggests the pasted address as the career page and no website", () => {
      expect(suggestCompanyFields("jobs.lever.co/spotify")).toEqual({
        url: "",
        name: "Spotify",
        careerUrl: "jobs.lever.co/spotify",
      });
    });

    it("leaves the name empty when the address carries no slug", () => {
      expect(suggestCompanyFields("jobs.lever.co")).toEqual({
        url: "",
        name: "",
        careerUrl: "jobs.lever.co",
      });
      expect(suggestCompanyFields("peopleforce.io").name).toBe("");
    });
  });
});
