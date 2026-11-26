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
    // Greenhouse embeds the board with a script, Ashby with an iframe: then
    // there is no link on the page at all.
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
    // A vacancy list on the home page: each leads to its own page of the same board.
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

  it("keeps a link to a known ATS that has no parser yet", () => {
    // Nothing can read it, but the address will be needed once a parser appears (task 5.15).
    const html = `<a href="https://acme.teamtailor.com/jobs?source=site#top">Jobs</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://acme.teamtailor.com/jobs", platform: "unsupported" },
    ]);
  });

  it("gives one finding per known ATS without a parser", () => {
    // We don't know the board form of such a platform, so vacancies of one board
    // are merged by platform: the first link stays.
    const html = `
      <a href="https://jobs.smartrecruiters.com/Acme/1-designer">Designer</a>
      <a href="https://jobs.smartrecruiters.com/Acme/2-engineer">Engineer</a>
      <a href="https://jobs.lever.co/acme">Worldwide</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      {
        url: "https://jobs.smartrecruiters.com/Acme/1-designer",
        platform: "unsupported",
      },
      { url: "https://jobs.lever.co/acme", platform: "lever" },
    ]);
  });

  it("turns BambooHR job links into the company's careers page", () => {
    // Task 6.26.
    const html = `
      <a href="https://acme.bamboohr.com/careers/12?source=site">Designer</a>
      <a href="https://acme.bamboohr.com/careers/34">Engineer</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://acme.bamboohr.com/careers", platform: "bamboohr" },
    ]);
  });

  it("turns Pinpoint posting links into the company's careers page", () => {
    // Task 6.27.
    const html = `
      <a href="https://acme.pinpointhq.com/en/postings/1a2b">Designer</a>
      <a href="https://acme.pinpointhq.com/en/postings/3c4d">Engineer</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://acme.pinpointhq.com/", platform: "pinpoint" },
    ]);
  });

  it("finds a TalentAdore board in the data address of its widget", () => {
    // Task 6.28: the ELK Studios page has no links to TalentAdore - the JSON
    // address is only in the widget's `data-url`.
    const html = `
      <script src="https://ats.talentadore.com/static/ta-json-careers.js"></script>
      <div class="ta-careers" data-url="https://ats.talentadore.com/positions/rR1TqSR/json?v=2&amp;language="></div>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      {
        url: "https://ats.talentadore.com/positions/rR1TqSR/json",
        platform: "talentadore",
      },
    ]);
  });

  it("turns Workable job links into the account's careers page", () => {
    // Task 6.25: links to vacancies of one account are one finding.
    const html = `
      <a href="https://apply.workable.com/acme/j/1/">Designer</a>
      <a href="https://apply.workable.com/acme/j/2/">Engineer</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://apply.workable.com/acme/", platform: "workable" },
    ]);
  });

  it("ignores the website of an ATS vendor", () => {
    const html = `<footer><a href="https://www.teamtailor.com/">Powered by Teamtailor</a></footer>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([]);
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
