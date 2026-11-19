import { describe, expect, it } from "vitest";

import { boardOwnership } from "./ownership.ts";

// Розмітка - скорочена з дошок, які показали ці сигнали на справжній мережі
// 19.11.2026 (tasks/5.05-page-ownership-check.md).
describe("boardOwnership", () => {
  it("confirms a board that links to the company site", () => {
    // Greenhouse `discord`: звичайне посилання на сайт.
    const html = `<div><a href="https://discord.com/">Discord</a></div>`;

    expect(boardOwnership(html, "https://discord.com")).toEqual({
      kind: "confirmed",
    });
  });

  it("confirms by the website Ashby puts into the page data", () => {
    // Ashby малює дошку JavaScript-ом: посилань немає, сайт - у JSON сторінки.
    const html = `<script>window.__appData = {"organization":{"name":"Linear","publicWebsite":"https://linear.app/","customJobsPageUrl":"https://linear.app/careers"}};</script>`;

    expect(boardOwnership(html, "https://www.linear.app")).toEqual({
      kind: "confirmed",
    });
  });

  it("treats www and subdomains as the same site", () => {
    const html = `<div class="main-footer-text"><a href="https://www.palantir.com/">Palantir Technologies Home Page</a></div>`;

    expect(boardOwnership(html, "https://palantir.com/careers")).toEqual({
      kind: "confirmed",
    });
    expect(boardOwnership(html, "https://careers.palantir.com")).toEqual({
      kind: "confirmed",
    });
  });

  it("names the other site a board says it belongs to", () => {
    // Lever `spotify`: логотип у шапці веде на інший домен тієї ж компанії.
    const html = `<div class="main-header-content"><a class="main-header-logo" href="http://spotifyjobs.com"><img alt="Spotify logo"></a></div>`;

    expect(boardOwnership(html, "https://www.spotify.com")).toEqual({
      kind: "other",
      site: "spotifyjobs.com",
    });
  });

  it("takes the other site from the Ashby page data and the Lever footer", () => {
    expect(
      boardOwnership(
        `<script>{"publicWebsite":"https://acme-corp.example/"}</script>`,
        "https://acme.example",
      ),
    ).toEqual({ kind: "other", site: "acme-corp.example" });
    expect(
      boardOwnership(
        `<div class="main-footer-text"><a href="https://www.acme-corp.example/">Acme Home Page</a></div>`,
        "https://acme.example",
      ),
    ).toEqual({ kind: "other", site: "acme-corp.example" });
  });

  it("knows nothing from links that do not name the company site", () => {
    // Посилання на саму платформу, соцмережі й політики є на кожній дошці і
    // належності не доводять ні в який бік.
    const html = `
      <a class="main-header-logo" href="https://jobs.lever.co/acme">Acme</a>
      <a href="https://www.linkedin.com/company/acme-corp">LinkedIn</a>
      <a href="https://www.lever.co/job-seeker-support/">Powered by Lever</a>`;

    expect(boardOwnership(html, "https://acme.example")).toEqual({
      kind: "unknown",
    });
  });

  it("prefers a link to the company site over another site", () => {
    const html = `
      <a class="main-header-logo" href="https://acmejobs.example">Acme</a>
      <a href="https://acme.example/about">About Acme</a>`;

    expect(boardOwnership(html, "https://acme.example")).toEqual({
      kind: "confirmed",
    });
  });
});
