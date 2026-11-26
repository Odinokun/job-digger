import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findLinkGroups, parseOwnPage } from "./own-page.ts";

/** A real company career page (src/server/http/testing). */
function saved(path: string): string {
  return readFileSync(
    new URL(`../http/testing/responses/${path}`, import.meta.url),
    "utf8",
  );
}

/** Framer: the title is an `h2` inside the link; next to it, a group of category links. */
const KINGGROUP = {
  url: "https://kinggroup.io/vacancies/tech",
  html: saved("kinggroup.io/vacancies/tech"),
};
/** WordPress: the link says "View & Apply", the title is an `h3` in the card next to it. */
const DELASPORT = {
  url: "https://www.delasport.com/careers/",
  html: saved("www.delasport.com/careers/index"),
};
/** The link is empty, the title is `div.vacancies__title` in the card. */
const NCUBE = {
  url: "https://ncube.com/career",
  html: saved("ncube.com/career"),
};
/** The link is the whole card: department, title (`career-item__position`), location. */
const ALISTWARE = {
  url: "https://a-listware.com/career",
  html: saved("a-listware.com/career"),
};

describe("findLinkGroups", () => {
  it("finds the vacancy links of a Framer page", () => {
    const [best] = findLinkGroups(KINGGROUP.html, KINGGROUP.url);

    // Relative `./design/<slug>` links from the `/vacancies/tech` page.
    expect(best.prefix).toBe("kinggroup.io/vacancies/design/");
    expect(best.vacancies).toHaveLength(10);
    expect(best.vacancies.map((vacancy) => vacancy.title)).toEqual(
      expect.arrayContaining(["Frontend Developer", "React Native developer"]),
    );
    expect(best.vacancies[0]).toEqual({
      title: "DevOps Engineer",
      url: "https://kinggroup.io/vacancies/design/devops-engineer",
    });
  });

  it("puts vacancies deeper than the page before categories of its level", () => {
    // The list categories (`/vacancies/hr`) are on the same level as the
    // `/vacancies/tech` page; vacancies are deeper. There are more categories, but they come second.
    const html = `<html><body><main>
      <div><a href="/vacancies/hr">HR</a></div>
      <div><a href="/vacancies/finance">Finance</a></div>
      <div><a href="/vacancies/design">Design</a></div>
      <div><a href="/vacancies/design/frontend"><h3>Frontend Developer</h3></a></div>
    </main></body></html>`;

    expect(
      findLinkGroups(html, "https://acme.example/vacancies/tech").map(
        (group) => [group.prefix, group.vacancies.length],
      ),
    ).toEqual([
      ["acme.example/vacancies/design/", 1],
      ["acme.example/vacancies/", 3],
    ]);
  });

  it("takes the title from the card when the link only says View & Apply", () => {
    const [best] = findLinkGroups(DELASPORT.html, DELASPORT.url);

    expect(best.prefix).toBe("www.delasport.com/job/");
    expect(best.vacancies).toHaveLength(6);
    expect(best.vacancies.map((vacancy) => vacancy.title)).toContain(
      "MongoDB Engineer",
    );
    expect(best.vacancies.map((vacancy) => vacancy.title)).not.toContain(
      "View & Apply",
    );
  });

  it("takes the title from the card when the link is empty", () => {
    const [best] = findLinkGroups(NCUBE.html, NCUBE.url);

    expect(best.prefix).toBe("ncube.com/career/");
    expect(best.vacancies).toHaveLength(12);
    expect(best.vacancies).toContainEqual({
      title: "Senior Full-Stack Engineer (Java, React) with AI/LLM Experience",
      url: "https://ncube.com/career/fullstack-java-react-ai",
    });
  });

  it("prefers the title element over other lines of the card", () => {
    const [best] = findLinkGroups(ALISTWARE.html, ALISTWARE.url);

    expect(best.prefix).toBe("a-listware.com/career/");
    expect(best.vacancies).toHaveLength(30);
    expect(best.vacancies).toContainEqual({
      title: "Senior Frontend Engineer (React)",
      url: "https://a-listware.com/career/senior-frontend-engineer-react",
    });
  });

  it("takes the link text over a longer department line", () => {
    // Teamtailor (headway): the title is the link itself, the department below is longer.
    const html = `<html><body><ul>
      <li><div><a href="/jobs/1-system-engineer">System Engineer</a>
        <div><span>People Operations Team</span> · <span>Kyiv</span></div></div></li>
      <li><div><a href="/jobs/2-designer">Designer</a>
        <div><span>Marketing Team</span></div></div></li>
    </ul></body></html>`;

    expect(
      findLinkGroups(html, "https://acme.example/jobs")[0].vacancies.map(
        (vacancy) => vacancy.title,
      ),
    ).toEqual(["System Engineer", "Designer"]);
  });

  it("takes the first line of the card over a longer description", () => {
    // Webflow (codebridge): the title class has a typo, the description below is longer.
    const html = `<html><body>
      <div><div class="career-postiton">Senior Frontend Developer</div>
        <div>Build the design system of a fintech product used by millions.</div>
        <a href="/vacancies/senior-frontend">See more</a></div>
    </body></html>`;

    expect(
      findLinkGroups(html, "https://acme.example/career")[0].vacancies,
    ).toEqual([
      {
        title: "Senior Frontend Developer",
        url: "https://acme.example/vacancies/senior-frontend",
      },
    ]);
  });

  it("offers at most three groups", () => {
    expect(
      findLinkGroups(ALISTWARE.html, ALISTWARE.url).length,
    ).toBeLessThanOrEqual(3);
  });

  it("finds nothing on a page without links of its own site", () => {
    const html = `<html><body>
      <h1>Careers</h1>
      <a href="https://jobs.lever.co/acme/1">Elsewhere</a>
      <a href="mailto:hr@acme.example">Write us</a>
    </body></html>`;

    expect(findLinkGroups(html, "https://acme.example/careers")).toEqual([]);
  });

  it("keeps links in the page navigation out", () => {
    const html = `<html><body>
      <header><nav>
        <a href="/careers/about">About</a><a href="/careers/team">Team</a>
      </nav></header>
      <main><div><a href="/careers/frontend-developer"><h3>Frontend Developer</h3></a></div></main>
      <footer><a href="/careers/privacy">Privacy</a></footer>
    </body></html>`;

    expect(findLinkGroups(html, "https://acme.example/careers")).toEqual([
      {
        prefix: "acme.example/careers/",
        vacancies: [
          {
            title: "Frontend Developer",
            url: "https://acme.example/careers/frontend-developer",
          },
        ],
      },
    ]);
  });
});

describe("parseOwnPage", () => {
  it("reads the vacancies the recipe points to", () => {
    const vacancies = parseOwnPage(
      KINGGROUP.html,
      KINGGROUP.url,
      "kinggroup.io/vacancies/design/",
    );

    expect(vacancies).toHaveLength(10);
    expect(vacancies[0]).toEqual({
      externalId: null,
      title: "DevOps Engineer",
      url: "https://kinggroup.io/vacancies/design/devops-engineer",
      location: null,
    });
  });

  it("takes only one more path segment after the prefix", () => {
    const html = `<html><body>
      <div><a href="/jobs/frontend"><h3>Frontend</h3></a></div>
      <div><a href="/jobs/frontend/apply"><h3>Apply</h3></a></div>
      <div><a href="/jobs/"><h3>All jobs</h3></a></div>
    </body></html>`;

    expect(
      parseOwnPage(
        html,
        "https://acme.example/careers",
        "acme.example/jobs/",
      ).map((vacancy) => vacancy.url),
    ).toEqual(["https://acme.example/jobs/frontend"]);
  });

  it("falls back to the address when a card has no text", () => {
    const html = `<html><body>
      <div><a href="/jobs/senior-react-developer"></a></div>
    </body></html>`;

    expect(
      parseOwnPage(html, "https://acme.example/careers", "acme.example/jobs/"),
    ).toEqual([
      {
        externalId: null,
        title: "senior react developer",
        url: "https://acme.example/jobs/senior-react-developer",
        location: null,
      },
    ]);
  });

  it("finds nothing when the site was redesigned", () => {
    expect(
      parseOwnPage(KINGGROUP.html, KINGGROUP.url, "kinggroup.io/careers/"),
    ).toEqual([]);
  });
});
