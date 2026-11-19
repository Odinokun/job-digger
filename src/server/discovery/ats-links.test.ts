import { describe, expect, it } from "vitest";

import { atsLinksOnPage } from "./ats-links.ts";

const PAGE = "https://acme.example/en/";

describe("atsLinksOnPage", () => {
  it("finds a board behind a link", () => {
    const html = `<nav><a href="https://jobs.lever.co/acme">Careers</a></nav>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://jobs.lever.co/acme", platform: "lever" },
    ]);
  });

  it("finds embedded boards", () => {
    // Greenhouse вбудовує дошку скриптом, Ashby - iframe: посилання на сторінці
    // тоді немає зовсім.
    const html = `
      <script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>
      <iframe src="https://jobs.ashbyhq.com/acme/embed"></iframe>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://job-boards.greenhouse.io/acme", platform: "greenhouse" },
      { url: "https://jobs.ashbyhq.com/acme", platform: "ashby" },
    ]);
  });

  it("reads protocol-relative links against the page", () => {
    const html = `<a href="//jobs.lever.co/acme">Jobs</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://jobs.lever.co/acme", platform: "lever" },
    ]);
  });

  it("gives one finding per board", () => {
    // Список вакансій на головній: кожна веде на свою сторінку тієї ж дошки.
    const html = `
      <a href="https://jobs.lever.co/acme/1">Designer</a>
      <a href="https://jobs.lever.co/acme/2">Engineer</a>
      <a href="https://jobs.lever.co/acme">All jobs</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://jobs.lever.co/acme", platform: "lever" },
    ]);
  });

  it("keeps the order in which boards appear", () => {
    const html = `
      <a href="https://team.peopleforce.io/careers">Ukraine</a>
      <a href="https://jobs.lever.co/acme">Worldwide</a>`;

    expect(atsLinksOnPage(html, PAGE).map((found) => found.platform)).toEqual([
      "peopleforce",
      "lever",
    ]);
  });

  it("ignores links that lead elsewhere", () => {
    const html = `
      <a href="/about">About</a>
      <a href="careers">Careers</a>
      <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
      <a href="mailto:jobs@acme.example">Write to us</a>
      <a href="javascript:void(0)">Menu</a>
      <a>No address</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([]);
  });

  it("finds nothing on a page that is not HTML", () => {
    expect(atsLinksOnPage("", PAGE)).toEqual([]);
    expect(atsLinksOnPage(`{"jobs": []}`, PAGE)).toEqual([]);
  });
});
