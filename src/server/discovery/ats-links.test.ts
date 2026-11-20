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

  it("keeps a link to a known ATS that has no parser yet", () => {
    // Читати нічим, але адреса знадобиться, коли зʼявиться парсер (задача 5.15).
    const html = `<a href="https://acme.teamtailor.com/jobs?source=site#top">Jobs</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://acme.teamtailor.com/jobs", platform: "unsupported" },
    ]);
  });

  it("gives one finding per known ATS without a parser", () => {
    // Форми дошки такої платформи ми не знаємо, тож вакансії однієї дошки
    // склеюються за платформою: першим лишається перше посилання.
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
    // Задача 6.26.
    const html = `
      <a href="https://acme.bamboohr.com/careers/12?source=site">Designer</a>
      <a href="https://acme.bamboohr.com/careers/34">Engineer</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://acme.bamboohr.com/careers", platform: "bamboohr" },
    ]);
  });

  it("turns Pinpoint posting links into the company's careers page", () => {
    // Задача 6.27.
    const html = `
      <a href="https://acme.pinpointhq.com/en/postings/1a2b">Designer</a>
      <a href="https://acme.pinpointhq.com/en/postings/3c4d">Engineer</a>`;

    expect(atsLinksOnPage(html, PAGE)).toEqual([
      { url: "https://acme.pinpointhq.com/", platform: "pinpoint" },
    ]);
  });

  it("turns Workable job links into the account's careers page", () => {
    // Задача 6.25: посилання на вакансії одного акаунта - одна знахідка.
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
