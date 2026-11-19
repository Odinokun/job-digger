import { describe, expect, it } from "vitest";

import { careerPagesInSitemap, careerPagesOnPage } from "./career-pages.ts";

const PAGE = "https://www.acme.example/en/";

describe("careerPagesOnPage", () => {
  it("finds a career page by the link text", () => {
    const html = `
      <a href="/en/about">About</a>
      <a href="/en/team">Join us</a>
      <a href="/de/karriere">Karriere</a>
      <a href="/ua/robota">Вакансії</a>`;

    expect(careerPagesOnPage(html, PAGE)).toEqual([
      "https://www.acme.example/en/team",
      "https://www.acme.example/de/karriere",
      "https://www.acme.example/ua/robota",
    ]);
  });

  it("finds a career page by its path", () => {
    // Текст посилання буває будь-яким, зокрема іконкою без тексту.
    const html = `<a href="/en/careers"><svg></svg></a>`;

    expect(careerPagesOnPage(html, PAGE)).toEqual([
      "https://www.acme.example/en/careers",
    ]);
  });

  it("cuts a vacancy link down to its career page", () => {
    // Список вакансій на головній: шлях обрізається по сегмент зі словом, і
    // всі вакансії дають одну сторінку.
    const html = `
      <a href="/careers/designer-12">Designer</a>
      <a href="/careers/engineer-34?ref=home">Engineer</a>`;

    expect(careerPagesOnPage(html, PAGE)).toEqual([
      "https://www.acme.example/careers",
    ]);
  });

  it("accepts career subdomains of the same site", () => {
    const html = `
      <a href="https://careers.acme.example/">Careers</a>
      <a href="https://acme.example/jobs">Jobs</a>`;

    expect(careerPagesOnPage(html, PAGE)).toEqual([
      "https://careers.acme.example/",
      "https://acme.example/jobs",
    ]);
  });

  it("ignores career pages of other sites and job boards", () => {
    // Чужий сайт не доводить належності, а дошки ATS - справа atsLinksOnPage.
    const html = `
      <a href="https://partner.example/careers">Partner careers</a>
      <a href="https://www.linkedin.com/company/acme/jobs">Jobs on LinkedIn</a>
      <a href="https://jobs.lever.co/acme">Careers</a>`;

    expect(careerPagesOnPage(html, PAGE)).toEqual([]);
  });

  it("ignores words that only look like careers", () => {
    const html = `
      <a href="/blog/how-we-hire">How we hire</a>
      <a href="/jobsite-safety">Jobsite safety</a>
      <a href="/en/">Home</a>
      <a href="#careers">Careers</a>
      <a href="mailto:jobs@acme.example">jobs@acme.example</a>`;

    expect(careerPagesOnPage(html, PAGE)).toEqual([]);
  });
});

describe("careerPagesInSitemap", () => {
  const SITE = "https://acme.example/";

  it("finds career pages among the sitemap addresses", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://acme.example/</loc></url>
        <url><loc>https://acme.example/en/about</loc></url>
        <url><loc>https://acme.example/en/jobs</loc></url>
        <url><loc>https://acme.example/en/jobs/designer-12</loc></url>
        <url><loc>https://acme.example/de/karriere</loc></url>
      </urlset>`;

    expect(careerPagesInSitemap(xml, SITE)).toEqual([
      "https://acme.example/en/jobs",
      "https://acme.example/de/karriere",
    ]);
  });

  it("ignores other sites and nested sitemaps", () => {
    // Вкладені sitemap не читаються: на кожен пішов би ще один запит до
    // чужого сайту, а кар'єрну сторінку зазвичай видно й без них.
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://acme.example/careers-sitemap.xml</loc></sitemap>
      </sitemapindex>
      <urlset><url><loc>https://other.example/careers</loc></url></urlset>`;

    expect(careerPagesInSitemap(xml, SITE)).toEqual([]);
  });

  it("finds nothing in what is not a sitemap", () => {
    expect(
      careerPagesInSitemap("<html><body>Not found</body></html>", SITE),
    ).toEqual([]);
  });
});
