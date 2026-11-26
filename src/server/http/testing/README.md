# src/server/http/testing - the fake web server

Tests never reach real websites ([CLAUDE.md](../../../../CLAUDE.md#tests-and-tdd)).
Instead of the platforms and company sites, a local server answers them with saved
real responses.

## Files

| File                           | Role                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `fake-web.ts`                  | `startFakeWeb({ root, port })` - a server on `127.0.0.1`   |
| `fake-web.integration.test.ts` | Serving a file, ignoring the query string, 404, escaping the folder |
| `serve-fake-web.ts`            | Running as a separate process: `node serve-fake-web.ts <port>`, serves `responses/` - this is how Playwright starts it for E2E |

## Address scheme

The domain becomes the first part of the path:

```
https://boards-api.greenhouse.io/v1/boards/acme/jobs
→ {fake server origin}/boards-api.greenhouse.io/v1/boards/acme/jobs
→ file {root}/boards-api.greenhouse.io/v1/boards/acme/jobs
```

- **A path ending in `/` is the `index` file in the folder.** The client turns the
  site root `https://acme.example` into `/acme.example/`, and a folder cannot be a
  file, so the response lives in `responses/acme.example/index`.
- **The query string is ignored.** Only the path decides the response: `?content=true`
  and no query serve the same file.
- **No file - 404.** That is how tests also see a missing platform page.
- **The content type comes from the file's first character:** `{` or `[` - JSON, `<` -
  HTML, anything else - text. Files usually have no extension, because the name
  repeats the platform's path (`.../jobs`).
- **There is no way out of `root`.** The path is decoded, and then the server checks
  that the file lies inside `root`: otherwise `..%2f` (an encoded slash) would reach a
  file outside the folder. The test makes a raw request through `node:http`, because
  `fetch` normalizes `..` and `%2e%2e` before sending and never brings them to the
  server.

## Saved responses

They live in `responses/` under the same address scheme. These are real platform
responses, saved as they are, without edits: parser tests have to see what the
platform really returns, including fields its documentation does not mention.

They are copies of public pages and API responses, saved for tests only. The content
belongs to its owners (the companies and platforms) and is not covered by the
project's MIT licence.

| File | Source | When |
| ---- | ------ | ---- |
| `responses/boards-api.greenhouse.io/v1/boards/discord/jobs` | Greenhouse Job Board API, the Discord board, without `content=true` (26 vacancies) | 18.11.2026 |
| `responses/api.lever.co/v0/postings/leverdemo` | Lever Postings API, Lever's own demo site, `mode=json` (10 vacancies, 83 KB) | 18.11.2026 |
| `responses/api.ashbyhq.com/posting-api/job-board/linear` | Ashby Job Postings API, the Linear board (33 vacancies, 468 KB - the API always returns descriptions) | 18.11.2026 |
| `responses/nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs` | Workday, the NVIDIA site, a POST with `searchText: "Warsaw"` - 11 vacancies, one page. The fake server does not read the request body, so it returns this file for any POST here | 18.11.2026 |
| `responses/jobs.ashbyhq.com/linear` | The Ashby Linear board page for people, 26 KB of HTML: JavaScript draws the board, and the organization's site (`publicWebsite: linear.app`) is in the page's JSON | 19.11.2026 |
| `responses/team.peopleforce.io/careers` | PeopleForce's own careers page, HTML (6 vacancies, one page) | 18.11.2026 |
| `responses/webellian.peopleforce.io/careers` | Webellian's careers page on PeopleForce, `?page=1` - 10 of 23 vacancies, with a link to the next page | 18.11.2026 |
| `responses/peopleforce.softconstruct.com/careers` | PeopleForce on the company's domain, SoftConstruct, `?page=1` - 10 of 215 vacancies (515 KB - a filter with hundreds of departments). Older markup: the "next" link has no `rel="next"` (task 5.13) | 21.11.2026 |
| `responses/breezy.breezy.hr/json` | The public JSON of Breezy HR's own board (3 vacancies) | 19.11.2026 |
| `responses/jobs.breezy.hr/json` | The public JSON of a second Breezy HR board: one remote vacancy (`is_remote: true`) | 19.11.2026 |
| `responses/cleverstaff.net/hr/public/getAllOpenVacancy` | CleverStaff, the 8allocate board (8 remote vacancies with descriptions - 196 KB). The server ignores the query string, so this is the response for any alias | 19.11.2026 |
| `responses/spribe.hurma.work/api/v1/public-vacancies` | Hurma, the Spribe board, `per_page=100&page=1` (6 vacancies, one page; one has `residence`, one has `work_format: "Remote"`). Without the `X-Requested-With` header the real API gives 403; the fake server does not read headers | 19.11.2026 |
| `responses/astrafy.jobs.personio.de/xml` | The Personio XML feed, the Astrafy board (4 vacancies with descriptions, 27 KB; two have `additionalOffices`). The server serves it as HTML because the file starts with `<` - the parser does not look at the content type | 19.11.2026 |
| `responses/dps.softgarden.io/en/vacancies` | An old softgarden board, DPS: server-rendered HTML with all 19 vacancies (JavaScript draws the pages); a card's locations are several `location-view-item`, and the IDs are also in `SG.allJobLocations` | 19.11.2026 |
| `responses/altenar.bamboohr.com/careers/list` | The JSON of a BambooHR careers page, the company Altenar (12 vacancies; one has an empty `location`, the place is in `atsLocation`) | 20.11.2026 |
| `responses/gig.pinpointhq.com/postings.json` | The JSON of a Pinpoint careers page, the company GiG (16 vacancies with descriptions, 100 KB; one position in several cities) | 20.11.2026 |
| `responses/ats.talentadore.com/positions/rR1TqSR/json` | The JSON of a TalentAdore widget, ELK Studios (3 vacancies; city and country plus the office address in `location`) | 20.11.2026 |
| `responses/apply.workable.com/api/v1/widget/accounts/goreel` | The JSON of a Workable widget, the GoReel account (3 vacancies with a company description) | 20.11.2026 |
| `responses/kinggroup.io/vacancies/tech` | kinggroup's own page on Framer, the Tech section: 10 vacancies as `./design/<slug>` links, the title is an `h2` in the link (221 KB) | 20.11.2026 |
| `responses/www.delasport.com/careers/index` | delasport's own page (WordPress): 6 vacancies, "View & Apply" links, the title is an `h3` in the card | 20.11.2026 |
| `responses/ncube.com/career` | ncube's own page (WordPress): 12 vacancies, empty links, the title is `div.vacancies__title` | 20.11.2026 |
| `responses/a-listware.com/career` | a-listware's own page (WordPress): 30 vacancies, a link card with the department, the title (`career-item__position`) and the location | 20.11.2026 |
| `responses/spinncloud.career.softgarden.de/jobs.feed.json` | The new softgarden careers site, SpiNNcloud: a schema.org `DataFeed` feed (6 vacancies with descriptions, 67 KB); one has `-` in place of a city | 19.11.2026 |
| `responses/cleverstaff.net/hr/public/getVacancy` | CleverStaff, the 8allocate vacancy `3ONpJV`: the parser learns the company alias from it | 19.11.2026 |

**Company sites are synthetic** (task 5.02). Finding career pages reads companies'
home pages, and a real page would pull hundreds of KB of markup and scripts, while
the test would depend on how the site looked on the day it was saved. So company
pages live on the reserved `.example` domains (RFC 2606) and contain only what the
test checks. This does not apply to platforms: their responses stay real.

| File | What is on the page | What for |
| ---- | ------------------- | -------- |
| `responses/globex.example/` | A home page with a "Karriere" link; `/de/karriere` embeds the Greenhouse board `discord` with a script | A career page found by a link (5.03) |
| `responses/initech.example/` | A home page without career links; `/careers` is an own page without an ATS | Common addresses (5.03) |
| `responses/umbrella.example/` | No links and no `/careers`; `sitemap.xml` leads to `/en/jobs`, which links to Ashby `linear` | Sitemap (5.03) |
| `responses/wayne.example/index` | A home page with a Careers link to the Greenhouse board `ghost`, which the server does not have | A failed trial read (5.06) |
| `responses/hooli.example/` | A home page with a vacancy on Teamtailor and a Careers link; `/careers` leads to two more Teamtailor vacancies and to Teamtailor's own site ("Powered by"). Until 6.26 this was BambooHR, but that got a parser | A known ATS without a parser: one finding per platform (5.15) |
| `responses/kramerica.example/index` | A home page with a Careers link to `jobs.kramerica.example/careers` - that is PeopleForce on a subdomain of the site | PeopleForce on the company's domain: the career page is the board itself (5.13) |
| `responses/vandelay.example/` | A home page with Careers; `/careers` is an own page without an ATS that leads to `peopleforce.vandelay.example/careers` | PeopleForce on the company's domain: one step past the career page, as at SoftConstruct (5.13) |
| `responses/acme.example/index` | The Acme home page: Careers and one vacancy lead to the Lever board `leverdemo`, plus internal links, LinkedIn and `mailto:` | Finding links to an ATS (5.02), the `e2e/find-pages.spec.ts` scenario |

The PeopleForce pages on subdomains of the synthetic sites
(`jobs.kramerica.example/careers`, `peopleforce.vandelay.example/careers`) are symbolic
links to the real `peopleforce.softconstruct.com/careers`: the site is synthetic, the
platform markup is real, and there is no 515 KB copy. The server checks lexically that
the path stays inside `root`, so it serves links inside `responses/`.

Updating or adding a response is one request to the real platform, for example:

```bash
curl -f -o src/server/http/testing/responses/boards-api.greenhouse.io/v1/boards/discord/jobs \
  https://boards-api.greenhouse.io/v1/boards/discord/jobs
```

After an update, tests that rely on specific vacancies may fail: the data on a board
changes. Prettier does not touch these files - they have no extension, and
`prettier --check .` skips them.

## Why it is done this way

The app's requests get here not through parser parameters but through a single
substitution point in the HTTP module (task 3.02): every outgoing request goes through
it, and in tests it sends them to this server. Parsers do not know about the
substitution, SSRF protection checks the real address, and nothing goes to the network.

We do not use MSW: it intercepts `fetch` only in its own process, while in E2E a
separate app process makes the requests. We do not use `HTTP_PROXY`: HTTPS would need a
TLS interceptor.
