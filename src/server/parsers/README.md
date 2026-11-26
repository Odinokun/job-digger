# src/server/parsers - vacancy parsers

They read vacancies from career sources: platform APIs (ATSs) and own pages with a
recipe. The schema.org JobPosting markup is postponed ([task 3.11](../../../tasks/3.11-schema-org-jobposting-parser.md)). Every request goes through the single HTTP client ([`src/server/http`](../http/README.md)).

There is no browser reading (Playwright): everything above is read with plain HTTP
requests, and on Vercel a browser might not fit into the time and resources of one server
function. It is worth adding only when an important site turns up that really needs it,
and with it Load more and dynamic loading.

## Files

| File                 | Role                                             |
| -------------------- | ------------------------------------------------ |
| `types.ts`           | The shared format: `ParsedVacancy`, `ParseResult`, `ParserError` |
| `greenhouse.ts`      | Greenhouse: `readGreenhouse(sourceUrl, client)` and its parts |
| `greenhouse.test.ts` | Unit tests of the Greenhouse parser              |
| `greenhouse.integration.test.ts` | `readGreenhouse` through the fake web server |
| `shared.ts`          | Shared by the parsers: `collectVacancies` (the broken record rule), `fetchJson` and `postJson` (request → status → JSON), `fetchText` (the same for HTML, plus the address after redirects), `UNREADABLE`, `isRecord`, `isWebUrl` |
| `shared.test.ts`     | Unit tests of `collectVacancies`                 |
| `lever.ts`           | Lever: `readLever(sourceUrl, client)`, `leverSite`, `parseLeverPostings` |
| `lever.test.ts`      | Unit tests of the Lever parser                   |
| `lever.integration.test.ts` | `readLever` through the fake web server and a server with pages |
| `ashby.ts`           | Ashby: `readAshby(sourceUrl, client)`, `ashbyBoard`, `parseAshbyJobs` |
| `ashby.test.ts`      | Unit tests of the Ashby parser                   |
| `ashby.integration.test.ts` | `readAshby` through the fake web server, including a response over 5 MB |
| `workday.ts`         | Workday: `readWorkday(sourceUrl, client)`, `workdaySite`, `parseWorkdayJobs` |
| `workday.test.ts`    | Unit tests of the Workday parser                 |
| `workday.integration.test.ts` | `readWorkday` through the fake web server and a server with pages |
| `peopleforce.ts`     | PeopleForce: `readPeopleForce(sourceUrl, client)`, `peopleforceSite`, `isPeopleForcePage`, `parsePeopleForcePage` |
| `peopleforce.test.ts` | Unit tests of the PeopleForce parser            |
| `peopleforce.integration.test.ts` | `readPeopleForce` through the fake web server and a server with pages |
| `breezy.ts`          | Breezy HR: `readBreezy(sourceUrl, client)`, `breezyCompany`, `parseBreezyPositions` |
| `breezy.test.ts`     | Unit tests of the Breezy HR parser               |
| `breezy.integration.test.ts` | `readBreezy` through the fake web server |
| `cleverstaff.ts`     | CleverStaff: `readCleverStaff(sourceUrl, client)`, `cleverstaffSource`, `cleverstaffBoardUrl`, `parseCleverStaffVacancies` |
| `cleverstaff.test.ts` | Unit tests of the CleverStaff parser            |
| `cleverstaff.integration.test.ts` | `readCleverStaff` through the fake web server: a board and a vacancy link |
| `hurma.ts`           | Hurma: `readHurma(sourceUrl, client)`, `hurmaCompany`, `hurmaBoardUrl`, `parseHurmaVacancies`, `hurmaHasNextPage` |
| `hurma.test.ts`      | Unit tests of the Hurma parser                   |
| `hurma.integration.test.ts` | `readHurma` through the fake web server and a server with pages and a header check |
| `personio.ts`        | Personio: `readPersonio(sourceUrl, client)`, `personioBoard`, `parsePersonioFeed` |
| `personio.test.ts`   | Unit tests of the Personio parser                |
| `personio.integration.test.ts` | `readPersonio` through the fake web server |
| `softgarden.ts`      | softgarden: `readSoftgarden(sourceUrl, client)`, `softgardenSource`, `softgardenBoardUrl`, `parseSoftgardenBoard` (the old board, HTML), `parseSoftgardenFeed` (the career site, JSON) |
| `softgarden.test.ts` | Unit tests of the softgarden parser              |
| `softgarden.integration.test.ts` | `readSoftgarden` through the fake web server and a server with a 400 response |
| `bamboohr.ts`        | BambooHR: `readBambooHr(sourceUrl, client)`, `bamboohrCompany`, `parseBambooHrList` |
| `bamboohr.test.ts`   | Unit tests of the BambooHR parser                |
| `bamboohr.integration.test.ts` | `readBambooHr` through the fake web server and a server that redirects an unknown company to the BambooHR site |
| `pinpoint.ts`        | Pinpoint: `readPinpoint(sourceUrl, client)`, `pinpointCompany`, `parsePinpointPostings` |
| `pinpoint.test.ts`   | Unit tests of the Pinpoint parser                |
| `pinpoint.integration.test.ts` | `readPinpoint` through the fake web server: an address with an anchor, 404 |
| `talentadore.ts`     | TalentAdore: `readTalentAdore(sourceUrl, client)`, `talentadoreBoard`, `talentadoreBoardUrl`, `parseTalentAdorePositions` |
| `talentadore.test.ts` | Unit tests of the TalentAdore parser            |
| `talentadore.integration.test.ts` | `readTalentAdore` through the fake web server: the widget address, 404 |
| `workable.ts`        | Workable: `readWorkable(sourceUrl, client)`, `workableAccount`, `parseWorkableWidget` |
| `workable.test.ts`   | Unit tests of the Workable parser                |
| `workable.integration.test.ts` | `readWorkable` through the fake web server: the account from a vacancy address, case, 404 |
| `vacancies-to-check.ts` | `VACANCIES_TO_CHECK` - the shared vacancy limit for parsers that read in pages; `pagesToRead` - how many pages that is at a `ReadDepth`; `parseVacanciesToCheck` |
| `vacancies-to-check.test.ts` | Parsing the variable and how many pages to read |
| `own-page.ts`        | An own page with a recipe (task 6.21): `findLinkGroups` (recipe candidates), `parseOwnPage` and `readOwnPage` (reading by prefix) |
| `own-page.test.ts`   | Unit tests of groups and titles on the real pages of kinggroup, delasport, ncube, a-listware |
| `own-page.integration.test.ts` | `readOwnPage` and `readSource` for `own_page` through the fake web server |
| `read-source.ts`     | `readSource(source, client)` - the parser for the source's platform, and for `own_page` by the source's recipe; `null` if there is no parser yet |

## Shared format

A parser returns `{ ok: true, vacancies, skipped }` or `{ ok: false, error }` (`types.ts`).

- **A vacancy** has `externalId` (the ID on the platform, the key is built from it; `null`
  if the platform gives no ID - then the key comes from the address), `title`, `url` (http
  or https only) and `location` (may be `null` - then the list shows "—").
- **Errors:** `not-found` (the page or board does not exist, 404), `unreadable` (the
  response is in the wrong format or the address is not the right one), `bad-status` (the
  site answered with something other than 2xx or 404 - with the status), `fetch-failed` (a
  request failure, with the `HttpError` reason).
- **Broken records come in two kinds** (`collectVacancies` in `shared.ts`):
  - **a broken structure** - the record is not an object, the id has the wrong type or is
    empty, the title or the address is not a string. This signals a format change: the
    whole response fails, because if such records were skipped, all of them would turn out
    skipped, and an empty list would delete every vacancy of the source. A failed check
    does not touch vacancies;
  - **bad data** - an empty title or an address that is not http(s). The vacancy is skipped
    and counted in `skipped` (a parse warning in the task details, task 4.01). If every
    record of a non-empty list is skipped, the response fails too.

  Until 3.08 any broken record failed the whole response (decision 3.06). Real data showed
  the cost: one OpenAI vacancy with an empty title blocked all 839.
- A parser only reads what is on the platform now. The discovery date, Read/Unread, the key
  and URL cleanup belong to the lifecycle (tasks 3.13 and 3.05).

## Vacancy limit and depth

Parsers that read the list in pages (Lever, Workday, PeopleForce, Hurma) read at most
`VACANCIES_TO_CHECK` vacancies (`vacancies-to-check.ts`, the variable of the same name in
`.env.example`, 500 by default). Pages are counted from the platform's page size
(`pagesToRead`): PeopleForce - 50, Workday - 25, Lever and Hurma - 5. Until task 6.16 the
limit was in pages (`PAGES_TO_CHECK = 5`), and the same limit gave 50 vacancies in one
place and 500 in another.

**Depth** (`depth`): `full` - up to the limit, `first-page` - only the first page. Who reads
how much: [`src/server/checks`](../checks/README.md#read-depth).

**An incomplete list.** If reading stopped at the limit or the first page rather than
because the list ended, the result has `truncated: true`. Then the lifecycle marks nothing
as gone (`src/server/vacancies`): the vacancies beyond the boundary did not disappear, they
were just not read. Reaching the limit is still a successful check. Parsers that take
everything in one request never set `truncated`.

Tests that need a specific number of pages pass `maxPages` explicitly: Vitest loads `.env`
(`vitest.config.ts`), and the author's value must not affect the result.

## How to add a platform

The list of places a new platform touches, collected from how PeopleForce was added. A
separate task for each platform, TDD, as in stage 3.

**Preparation**

- [ ] Check the API against the official documentation and link it. No public API - read
      the public page, as with PeopleForce, and note that the format was checked against
      real pages, not documentation.
- [ ] With a few real requests carrying the app's User-Agent, check what the documentation
      does not say: the response for an unknown board, the response size, pages, the
      order of vacancies.
- [ ] Save a small real response into `src/server/http/testing/responses/<host>/` and a row
      about it in the [fake server README](../http/testing/README.md).

**Platform**

- [ ] `src/lib/companies/platform.ts` - the value in `CAREER_PLATFORMS` and the domain in
      `PLATFORM_DOMAINS`. The domain table is in the [`src/lib/companies` README](../../lib/companies/README.md).
- [ ] Remove the platform from `src/lib/companies/known-ats.ts`: it holds only ATSs without a
      parser, and a leftover row would label the source with the name from that list.
- [ ] A migration: the `career_platform` enum is built from `CAREER_PLATFORMS`, so
      `npm run db:generate` ([how migrations work](../db/README.md)).
- [ ] `src/lib/companies/suggest.ts` - if the company name in the address lives in the
      subdomain rather than the first path segment (`SUBDOMAIN_SLUG_PLATFORMS`).
- [ ] The platform name in `messages/en.json` and `messages/uk.json` (`platforms.*`) and in
      `src/app/companies/page.tsx`.

**Parser**

- [ ] `<platform>.ts` - `read<Platform>(sourceUrl, client)`, a function that gets the board
      from any link, and the response parsing. The result format and the broken record
      rule: "Shared format" above.
- [ ] A unit test of the parsing on the saved response and an integration test through the
      fake web server.
- [ ] A row in `READERS` in `read-source.ts`.
- [ ] Reads in pages - `depth` and `pagesToRead`, `truncated` if it stopped at the limit
      ("Vacancy limit and depth" above).
- [ ] A section about the platform in this README and rows in the "Files" table.

**Page search** ([`src/server/discovery`](../discovery/README.md))

- [ ] `board-url.ts` - the single board address from the parser's function.
- [ ] `by-name.ts` - if the board address can be guessed from the company name. Every
      platform here is one more request for every name variant of every company.
- [ ] `ownership.ts` - the platform host in `PLATFORM_DOMAINS` and, if possible, how to read
      the company site from the board page.

**At the end**

- [ ] A manual check on the real network: two or three real boards and one that does not
      exist.
- [ ] Find new pages for Not tracked, so that companies on the new platform move to Tracked.

## Greenhouse

The API is `https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`, without
authorization ([documentation](https://docs.greenhouse.io/job-board.html)).

`greenhouseBoardToken` gets the board name from the source address as it is stored in
`career_sources.url` (absolute, as the user typed it): the board itself
(`job-boards.greenhouse.io/discord`, `boards.greenhouse.io/discord`), a vacancy link
(`.../discord/jobs/123`), an embedded board (`/embed/job_board?for=discord`). Not a
Greenhouse board - `null`. The EU host (`job-boards.eu.greenhouse.io`) is not supported:
there is no confirmed API for it.

`parseGreenhouseJobs` takes from each vacancy `id` (the posting ID, the same as in the link;
`internal_job_id` is the position ID, and it is `null` for "prospect" postings), `title`,
`absolute_url` and `location.name`. The test reads the real response of the Discord board
from the fake web server's saved responses.

`readGreenhouse(sourceUrl, client)` puts it all together: board name → request through the
HTTP client → parsing. An address without a Greenhouse board is `unreadable` without a
request. Integration tests go to the fake web server with the saved Discord response, and
for responses it does not have (not JSON, 403, silence) to their own server. Also checked on
the real network (by hand, 18.11.2026): Discord - 26 vacancies, Figma - 144, a board that
does not exist - `not-found`.

## Lever

The API is `https://api.lever.co/v0/postings/{site}?mode=json` (boards on `jobs.lever.co`)
and `https://api.eu.lever.co/...` (boards on `jobs.eu.lever.co`), without authorization
([documentation](https://github.com/lever/postings-api)). The site is the first path segment
of the board; `leverSite` also understands links to a posting and to an application form.

**In pages, not in one request.** Without `limit` Lever returns everything at once together
with descriptions: Palantir (306 vacancies) is 5.9 MB, more than the client's `MAX_BYTES`
(5 MB), and the source would not be read at all. So `readLever` asks for 100 at a time
(`skip`/`limit`), about 2 MB each, up to the vacancy limit ("Vacancy limit and depth"
above). An incomplete page is the last one; a full one means one more request, which comes
back empty. A failure of any page is a failure of the whole source.

**Lever does not sort by date** (checked on Palantir and the demo site), so on a site with
more than 500 vacancies the ones beyond the limit are not read. They do not become gone -
the list is marked `truncated` (task 6.16).

`parseLeverPostings`: `externalId` is `id` (a UUID, also in `hostedUrl`), the title is
`text`, the link is `hostedUrl`, the location is all `categories.allLocations` joined with
commas, and without them `categories.location`. An unknown site is a 404 with
`{"ok":false,"error":"Document not found"}`, that is `not-found` (the documentation does not
describe this, checked 18.11.2026).

Checked on the real network (by hand, 18.11.2026): Palantir - 306 vacancies in 4 pages, the
demo site - 10, a site that does not exist - `not-found`.

## Ashby

The API is `https://api.ashbyhq.com/posting-api/job-board/{name}`, without authorization
([documentation](https://developers.ashbyhq.com/docs/public-job-posting-api)). The board
name is the first path segment of `jobs.ashbyhq.com/{name}`; case does not matter (checked:
`Ashby` and `ashby` return the same).

**One request with a bigger size limit.** The API has no pages and always returns vacancy
descriptions: OpenAI (839 vacancies) is 14 MB, Ashby itself (77) is 4.4 MB, with the
client's shared limit of 5 MB. So `readAshby` asks for 30 MB for its request
(`ASHBY_MAX_BYTES`, `client.get(url, { maxBytes })`); arbitrary sites keep 5 MB.

`parseAshbyJobs`: `externalId` is `id` (a UUID, also in `jobUrl`; the documentation does not
describe the field, but the API returns it), the title is `title`, the link is `jobUrl`, the
location is `location` followed by `secondaryLocations`, joined with commas. A vacancy with
`isListed: false` is available only by a direct link and is not visible on the board - we
skip it, and it is not counted in `skipped`. An unknown board is a 404 `Not Found` (the
documentation does not describe this, checked 18.11.2026).

Checked on the real network (by hand, 18.11.2026): Linear - 33 vacancies, Ashby - 77, OpenAI
- 838 and one skipped (an empty title), a board that does not exist - `not-found`.

## Workday

**There is no public API documentation.** The parser goes where the Workday career site
itself goes in the browser: `POST https://{host}/wday/cxs/{tenant}/{site}/jobs` with the body
`{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`, without authorization.
Everything below was checked with real requests on 18.11.2026 (NVIDIA, Salesforce, Workday)
and may change without notice - so a broken structure here, as everywhere, fails the whole
response instead of quietly giving zero vacancies.

- **POST only.** A GET to the same address is 400. Hence the HTTP client has `post`
  ([`src/server/http`](../http/README.md#request-module)).
- **The address.** `workdaySite` understands both career site formats:
  `{tenant}.wd5.myworkdayjobs.com/{site}` and
  `wd5.myworkdaysite.com/recruiting/{tenant}/{site}`; the language segment (`/en-US/`) and
  vacancy links too. The same tenant answers on both domains.
- **Pages of 20.** Workday does not accept more: `limit: 50` is 400. The limit is
  `VACANCIES_TO_CHECK`, 500 vacancies by default, that is 25 pages (NVIDIA has over 2000).
  The first page seems to start with the newest ("Posted Today"), but the order is not
  strict and not described anywhere.
- **The end of the list comes from the first page's `total`** or from an incomplete page. On
  the following pages `total` is 0, and from `offset` 2000 Workday returns the first page
  again - "ask until an empty one comes" would loop here.
- **The ID is `externalPath`** (`/job/Poland-Warsaw/Engineer_JR2028965-1`). The list has no
  separate ID, and the requisition number from `bulletFields` is not unique: one
  requisition can have several postings (`_JR2028965-1` with `bulletFields:
  ["JR2028965"]`). The cost: the path contains the vacancy title, so a renamed vacancy
  becomes a new Unread, and the old one disappears. The real ID (`jobPostingInfo.id`) comes
  only from a separate request per vacancy - 100 requests with a 2 s pause instead of 5.
- **The link** is the career site address plus `externalPath`
  (`nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/...`), and it opens.
- **The location** is `locationsText` as is. For a vacancy with several locations this is
  "2 Locations": the locations themselves are again only in a separate request per vacancy.
- **Errors:** an unknown company site is a 404 `not found: Job_Posting_Site_ID`, that is
  `not-found`; an unknown tenant is 422, that is `bad-status` 422 (Workday does not explain
  what exactly 422 means, so we do not turn it into `not-found`).

Checked on the real network (by hand, 18.11.2026): NVIDIA on both domains and Workday itself
- 100 vacancies each in 5 pages (about 9 s because of the 2 s pause between requests), all
IDs different; an unknown site - `not-found`, an unknown tenant - `bad-status` 422.

## PeopleForce

**HTML, not an API.** The PeopleForce Careers API needs a company key
([documentation](https://developer.peopleforce.io/careers/v1/getting-started)), so the
parser reads the public page `https://{company}.peopleforce.io/careers` - the way a visitor
sees it. Cheerio parses the markup. The format was checked against real pages on 18.11.2026
(PeopleForce, Webellian, V2Cloud); it has no documentation.

- **The address.** `peopleforceSite` takes the company subdomain; `peopleforce.io` itself and
  `www` are the platform's site, not a company. A vacancy link works too.
- **PeopleForce on the company's domain** (task 5.13): `peopleforce.softconstruct.com`
  cannot be recognised by the host. `isPeopleForcePage` recognises such a page - by the
  `#results` list together with the "Powered by PeopleForce" credit (`.credit` with a link to
  `peopleforce.io`). The source is then saved with the `peopleforce` platform, and
  `readPeopleForce` reads `/careers?page=N` from the origin of its address: a host not on
  `peopleforce.io` proves nothing any more, the saved source has decided the platform.
  `peopleforceSite` stays strict - it decides whether a link from a page leads to a board,
  and there the host is the only sign.
- **A vacancy card** is a link in an `h4` inside `#results`: the path is
  `/careers/v/{ID}-{slug}`, and `externalId` is the numeric ID (the slug changes with the
  title, the ID does not). The location is the text next to the `fa-map-marker-alt` icon;
  not every company has it (Webellian's cards have nothing but the title), then `null`.
- **We trust a zero only together with the counter.** This is HTML, and changed markup could
  easily give "zero vacancies" - deleting all of them. Above the cards PeopleForce writes
  "Displaying X - Y of N in total": the text is translated ("Відображено ... з ..."), the
  numbers in `<strong>` are not. There must be exactly Y - X + 1 cards. No counter and no
  cards means there really are no vacancies ("There are currently no vacancies."). Any other
  combination, like a page without `#results`, is `unreadable`.
- **Pages of 10** (`PEOPLEFORCE_PAGE_SIZE`), `?page=N`, up to the vacancy limit (500 by
  default, that is 50 pages). The next page only while Y in the counter is less than N:
  PeopleForce does not reject a number beyond the list but returns the last page again. The
  "next" link does not work for this - in older markup (SoftConstruct, task 5.13) it has no
  `rel="next"`, and the parser would read 10 vacancies out of 215 as the whole list.
- **Errors:** an unknown company is a 404; a company without a careers page is a 302 to
  `/404`, which is a 404. Both are `not-found`.

Checked on the real network (by hand, 18.11.2026): PeopleForce - 6 vacancies, Webellian - 23
in 3 pages, V2Cloud - 3; a company without a careers page (`macpaw`) and one that does not
exist - `not-found`.

## Breezy HR

**Public JSON without documentation.** The board `https://{company}.breezy.hr` serves its
vacancies at `https://{company}.breezy.hr/json`, without a key. Officially this JSON is not
described anywhere - only third-party scrapers write about it, so everything below was
checked with real requests on 19.11.2026 (Breezy's own boards, `breezy` and `jobs`) and may
change without notice.

- **The address.** `breezyCompany` takes the company subdomain, including from a vacancy link
  (`/p/{id}-{slug}`). Breezy's own subdomains are not companies: `assets-cdn` (it hosts the
  embedded board's scripts, so links to it turn up on company sites), `app`, `www`.
- **One request, no pages:** an array of all vacancies.
- **Fields:** `externalId` is `id` (also at the start of the vacancy path), the title is
  `name`, the link is `url`, the location is `location.name`, and for a remote vacancy
  (`location.is_remote: true`) with a "remote" note (`United States, remote`).
- **Errors:** an unknown board is a 404 (an HTML "not found" page), that is `not-found`.
  Third-party scrapers write that a company can turn the public JSON off; how the board
  answers then, there was nothing to check on.
- **The company site** on the board page is the header item `li.link.company`: the ownership
  of a board found by name is checked by it (`src/server/discovery/ownership.ts`).

Checked on the real network (by hand, 19.11.2026): `breezy` - 3 vacancies, `jobs` - one
remote, a board that does not exist - `not-found`.

## CleverStaff

**The board is an SPA on the platform's own host:** `https://cleverstaff.net/i/{alias}-vacancies`,
a vacancy is `https://cleverstaff.net/i/vacancy-{localId}`. The page takes its data from a
public API without a key. Checked with real requests on 19.11.2026 (8allocate, -A-HR-, MEV).

- **The undocumented `getAllOpenVacancy`, not the documented `getVacancies`.** The
  [documentation](https://neo.cleverstaff.net/api.html) describes `GET
  /hr/public/getVacancies?alias=`, but for a board without vacancies (MEV) it answers
  `notFound`, the same as for one that does not exist - and the check would decide there is
  no board. The board page itself calls `GET /hr/public/getAllOpenVacancy?alias=&lang=en`
  (visible in its JavaScript), and that one gives `status: "ok"` without an `objects` field
  for an empty board. The cost: an undocumented API that may change without notice.
- **Errors come with status 200:** `{"status":"error","code":"notFound"}` is `not-found`,
  any other `code` (for example `accountBlocked`) is `unreadable`.
- **The alias is case-sensitive** and may have hyphens (`-A-HR-`).
- **A vacancy link** does not contain the company alias: the parser first asks `GET
  /hr/public/getVacancy?host=&id={localId}` (the `object.alias` field), then reads the board.
  A closed vacancy is `vacancyIsNotPublic`, that is `not-found`.
- **Fields:** `externalId` is `localId`, the title is `position`, the link is built from
  `localId`, the location is the `displayFullName` of all `regions` joined with "; " (or
  `region`), with a "remote" note for `workCondition: "remote"`. The statuses on a public
  board are `inwork`, `open`, `replacement`, all open, so they are not filtered.
- One request for the whole board, no pages. The response includes vacancy descriptions: 33
  vacancies are 514 KB.

Checked on the real network (by hand, 19.11.2026): -A-HR- - 33 vacancies with locations, an
8allocate vacancy link - 8, MEV - 0, a board that does not exist - `not-found`.

## Hurma

**The public page's API, without documentation.** A company's vacancies page is
`https://{company}.hurma.work/public-vacancies`, an SPA: the HTML has no vacancies. It takes
its data from `GET /api/v1/public-vacancies` (visible in its JavaScript). Hurma's help
([Job opening page](https://support.hurma.work/en/collections/34-job-opening-page))
describes neither the page address nor the API, so everything below was checked with real
requests on 19.11.2026 (Spribe, Talents Boutique, Dataforest, mono, Nova Ukraine) and may
change without notice.

- **The `X-Requested-With: XMLHttpRequest` header is required:** without it the API answers
  403 with any User-Agent, including a browser one. This is Laravel's "request from the
  page's JavaScript" marker, not bot protection; robots.txt is empty. We send it, and the UA
  stays honest. The client has `headers` in the request options for this
  ([`src/server/http`](../http/README.md#request-module)).
- **The address.** `hurmaCompany` takes the company subdomain, including from a vacancy link
  (`/public-vacancies/{id}`). Hurma's own subdomains are not companies: `www`, `academy`
  (training), `support` (help). `demo` is Hurma's demo company, and it is read like any
  other.
- **Pages of 100** (`per_page=100&page=N`; the API does not accept more - 422 "per page must
  be 100 maximum", 20 by default), up to the vacancy limit - 500 by default, that is 5 pages.
  The next page only if there is `links.next` (the response is in Laravel's pagination
  format). A page beyond the list is empty, not the last one.
- **Fields:** there is no separate ID - `externalId` is the number at the end of `public_url`
  (`/public-vacancies/243`); an address without it is a broken structure. The title is
  `name`, the link is `public_url` (it opens, 200), the location is `residence` (places
  separated by "|" become ", ") followed by `work_format` ("Remote", "In the office/On
  site"). Many vacancies have both fields empty - then `null`.
- **The order** is not by date and is not described anywhere: at Talents Boutique it is by
  title, at Dataforest neither.
- **Errors:** an unknown company is a 404 "default backend - 404" from the load balancer,
  that is `not-found`.
- **The page does not show the company site** (only the name and the logo), so the ownership
  of a board found by name is not checked.

Checked on the real network (by hand, 19.11.2026): Spribe - 6 vacancies, a Talents Boutique
vacancy link - 40 in one page, mono - 1 with the location "Київ, Україна", a company that
does not exist - `not-found`; by name, Monobank and Spribe find their Hurma boards. A board
without vacancies could not be found, so the response for one was checked only with a test
(an empty `data`).

## Personio

**A documented XML feed:** `https://{company}.jobs.personio.de/xml`, without a key
([documentation](https://developer.personio.de/docs/retrieving-open-job-positions)). The
root is `<workzag-jobs>`, a vacancy is `<position>`, the vacancy link is
`https://{company}.jobs.personio.de/job/{id}` (from the integration example there). Cheerio
parses the XML in `xml: true` mode - the same library as for HTML.

What the documentation does not say was checked with real requests on 19.11.2026 (Astrafy,
Telio Group, IITS, DCI, PJM):

- **The address.** `personioBoard` understands the board, the feed and a vacancy link.
  `{company}.jobs.personio.com` serves the same feed, so the board stays on the domain from
  the link. `www` is not a company, and `personio.com` is the vendor's site.
- **One request, no pages:** all vacancies together with descriptions. DCI (25 vacancies) is
  140 KB; that is far from the shared 5 MB limit, but there was no board with hundreds of
  vacancies to check on.
- **`?language=` is not needed:** without it the feed is complete, while with `language=de`
  Astrafy lost the description blocks that have no German version. The vacancy titles are
  the same.
- **Fields:** `externalId` is `id` (digits only, otherwise a broken structure), the title is
  `name` (the position's own child `<name>`: description blocks have a `<name>` too), the
  location is `office` followed by `additionalOffices/office`, joined with commas, without
  repeats. `additionalOffices` is not in the documentation's table, but the feed returns it.
- **Errors:** an unknown board is a 404, that is `not-found`. A closed vacancy at `/job/{id}`
  is a 404 too. Whether a company can turn the feed off, the documentation does not say.
- **The company site** on the board page is the logo in the header (`a.logo-wrapper`): the
  ownership of a board found by name is checked by it (`src/server/discovery/ownership.ts`).

Checked on the real network (by hand, 19.11.2026): DCI - 25 vacancies, a Telio Group vacancy
link on `.com` - 11, IITS with `?language=de` in the link - 8, a board that does not exist -
`not-found`; by name, Astrafy finds its board (4 vacancies), and the logo confirms that the
Telio Group board belongs to `tel.io`.

## softgarden

**Two products, both without documentation.** The documented API
([dev.softgarden.de](https://dev.softgarden.de/frontend-v3/jobs-eines-kanals/),
`api.softgarden.io`) needs a client ID from softgarden, so it is closed to us. Two different
boards can be read publicly, and `softgardenSource` tells them apart by host. Everything
below was checked with real requests on 19.11.2026 and may change without notice. Both live
in one `softgarden` platform.

**The old board `https://{company}.softgarden.io/{lang}/vacancies`** (DPS, Alcedis, Sikla,
Nuvisan, Kraftanlagen, JD Sports, Plath) is server-rendered HTML (Apache Wicket), read with
Cheerio.

- **All vacancies on one page.** JavaScript draws pages of 10-20 (`jobs_per_page` in the
  script), while the HTML holds every card: Kraftanlagen - 85. The board root is a 302 to
  `/en/vacancies`; the parser asks for `/en/vacancies` straight away (vacancy titles are not
  translated by language).
- **A card** is `.matchElement#job_id_{id}`; the table header is a `.matchElement` too, but
  with `.matchHeadline`. The title and the link are `.title a`
  (`../job/{id}/{slug}?jobDbPVId=...`; the query string is dropped), the locations are the
  `.location-view-item` elements joined with commas.
- **We trust a zero through the map data.** JavaScript fills in the "Your search returned
  {0} positions" counter, so the HTML has no number. But the page's script puts every vacancy
  with a geolocation into `SG.allJobLocations` with a `postingId`: every such ID must be
  among the cards, otherwise `unreadable`. On all 7 boards the sets matched completely. A page
  without `SG.allJobLocations` is `unreadable` too. **No board without vacancies was found**,
  so a zero was checked only with a test: if a real empty board looks different, it will
  give `unreadable`, not zero.
- **An unknown company** is a 404. The page does not show the company site (there are no
  external links), so ownership is not checked.

**The career site `https://{company}.career.softgarden.de`** (softgarden, SpiNNcloud, BEE
Partment, Crown) is a schema.org `DataFeed` feed at `/jobs.feed.json` (the page itself links
to it).

- **One request:** all vacancies with descriptions; Crown (111) is 716 KB.
- **The feed is complete when `numberOfItems` equals the number of `dataFeedElement`.**
- **Fields:** `externalId` is `identifier.value` (also in `/jobs/{id}/...`), the title is
  `title`, the link is `url` as is (at Crown it leads to another subdomain,
  `crown.career.softgarden.de`), the location is the city (or region) and country of every
  `jobLocation` (an object, and by the schema possibly an array), several places joined with
  "; ". softgarden fills empty address parts with `-`, and those are dropped.
- **An unknown site is a 400** `{"errorMessage":"No such client for domain ..."}`, not a 404.
  A request without parameters gets no other 400, so this is `not-found`.
- **The company site** is the logo in the header (`HeaderLogo__BrandLink-...`, a
  styled-components class): ownership is checked by it (`src/server/discovery/ownership.ts`).

Checked on the real network (by hand, 19.11.2026): Kraftanlagen from the board root - 85
vacancies, Sikla from `/de/vacancies` - 29, Crown - 111, BEE Partment - 30, a board and a
site that do not exist - `not-found`; by name, Nuvisan finds its old board (8 vacancies),
and the logo confirms that BEE Partment belongs to `beepartment.com`.

## Workable

Task 6.25. **There is no documented public API:** the Workable API
([workable.readme.io](https://workable.readme.io/)) needs an account key. We read the JSON of
the embedded vacancy widget, `https://apply.workable.com/api/v1/widget/accounts/{account}`.
The format was checked with real requests on 20.11.2026 with the app's User-Agent:

- no key; an object `{ name, description, jobs }`, all vacancies in one request. Whether the
  widget cuts a long list was not checked: GoReel has only 3 vacancies;
- an unknown account is a 404;
- **case matters:** `goreel` is 200, `GoReel` is 404. Account addresses are written in lower
  case, so `workableAccount` lower-cases the account - otherwise the link
  `apply.workable.com/GoReel/` could not be read.

**Addresses.** The account is the first path segment of `apply.workable.com/{account}/…` or
the subdomain of the old format, `{account}.workable.com`. The short vacancy link
`apply.workable.com/j/{shortcode}` does not contain the account - it gives no finding.

**A vacancy:** the key is `shortcode`, the link is `url` (`apply.workable.com/j/{shortcode}`),
the location is `city, country` with a "remote" note for `telecommuting: true`. The
`locations` field (several cities with `hidden: true`) is not used: the Workable page does
not show it.

**Rules.** [Workable's terms](https://www.workable.com/terms) are a contract with its
employer customers; they say nothing about visitors of a public career page or automated
reading (checked 20.11.2026). The `robots.txt` of `apply.workable.com` forbids nothing.

## BambooHR

Task 6.26. **The documented API** of BambooHR needs a company key. We read the JSON that the
career page itself and the embedded widget use: `https://{company}.bamboohr.com/careers/list`.
Checked with real requests on 20.11.2026 with the app's User-Agent:

- no key; `{ meta: { totalCount }, result: [...] }`, all vacancies in one request
  (`totalCount` equals the length of `result`);
- **an unknown company is not a 404:** BambooHR redirects to `www.bamboohr.com` and serves
  HTML with status 200. So `readBambooHr` compares the host after redirects and treats a
  foreign host as `not-found`;
- the JSON has no vacancy link; the page `/careers/{id}` answers 200 - that is what we use.

**A vacancy:** the key is `id`, the title is `jobOpeningName`, the location is `location`
(city, region), and if that is empty, `atsLocation` (one Altenar vacancy has only the
country there). `locationType` is "0" or "1", but it is undocumented - we do not invent
"remote" from it.

**Rules.** [BambooHR's terms](https://www.bamboohr.com/legal/terms-of-service) are a
contract with customers who subscribe to the service. Among the restrictions is "any robot,
spider, other automated device… to monitor or copy any content from the Service"; whether it
applies to a visitor of a public career page is ambiguous. The `robots.txt` of company
subdomains forbids nothing. The author decided to go ahead.

## Pinpoint

Task 6.27. We found no documentation of the public JSON. We read
`https://{company}.pinpointhq.com/postings.json`; there is also `/jobs.rss`, but the JSON is
more complete. Checked with real requests on 20.11.2026 with the app's User-Agent:

- no key; `{ data: [...] }`, all vacancies in one request together with full descriptions
  (GiG: 100 KB for 16 vacancies, far from the 5 MB limit);
- an unknown company and the service subdomains (`www`, `app`) are a 404.

**A vacancy:** the key is `id`, the title is `title`, the link is `url`. The location is the
city and region without repeats ("Madrid, Madrid" → "Madrid"; the data has trailing spaces
here and there) and "remote" for `workplace_type: "remote"`. One position in several cities
is several records with different `id`s: they are different vacancies on the Pinpoint page
too, so they are for us as well.

**Rules.** Pinpoint's terms of use could not be found (`/terms` is a 404, and `/legal` has no
links to them). The `robots.txt` of career pages closes only `/mydata`, `/admin`,
`/companies`. The author decided to go ahead.

## TalentAdore

Task 6.28. TalentAdore shows vacancies in a widget embedded in the company's career page: the
script `ats.talentadore.com/static/ta-json-careers.js` and an element with the data address
in `data-url` - `https://ats.talentadore.com/positions/{token}/json?v=2&…`. There is no
documentation; checked with real requests on 20.11.2026 with the app's User-Agent:

- no key; `{ version, company, generated_at, jobs }`, all vacancies in one request. We do not
  pass the widget's query parameters: at ELK they are empty, and without them the list is the
  same. If some company's widget narrows the list with filters (`tags`, `businessUnits`), we
  will read more than it shows;
- an unknown token is a 404 with `{}`;
- **there is no list page for people** (`/positions/{token}` is a 404), so the source address
  is the JSON itself. The company token is only in this address: a vacancy link
  `/apply/{slug}/{token}` carries the vacancy's token. So Find pages also reads `data-url`
  (`ats-links.ts`), and there is no search by name for TalentAdore - the token cannot be
  guessed, and the name suggestion in Add company gives no name from such an address.

**A vacancy:** the key is `id`, the title is `name`, the link is `link`, the location is
`city, country`, and without them the `location` field (the office address is there).

**Rules.** [TalentAdore's terms](https://www.talentadore.com/legal/terms-and-conditions) say
nothing about automated reading; `robots.txt` closes `/api/` and `/authorize/`, not
`/positions/`. The author decided to go ahead.

## Own page

Task 6.21. A company page that no platform recognised (`unsupported`) is read once a person
confirms which links on it are vacancies: the Read as list button on the company card. The
recipe is the prefix of the vacancy addresses, `career_sources.vacancy_link_prefix`; the
source's platform becomes `own_page`.

**Why the address shape and not CSS classes.** Site builders change classes after every
publish (Framer - `framer-1wbyw24`), while vacancy addresses stay. The recipe
`kinggroup.io/vacancies/design/` means "links with this host and path plus one more
segment".

**Finding groups** (`findLinkGroups`): links to the same host, except `nav`, `header`,
`footer`, anchors, mail and the page itself, are grouped by prefix. The first is the most
likely:

1. **deeper than the page** - vacancies at `/vacancies/design/<slug>` from the page
   `/vacancies/tech`, while categories like `/vacancies/hr` are on the same level;
2. **with a career word** in the path (`career`, `job`, `vacanc`, `ваканс`…);
3. **bigger**.

Groups with neither of the first two signs (menus, services) are shown only if there are no
others. The dialog shows up to three (`MAX_LINK_GROUPS`).

**The vacancy title** comes from the "card" - the largest ancestor of the link in which every
link leads to the same vacancy. In order:

| Title source | Where it occurred |
| --- | --- |
| An `h1-h6` heading | kinggroup (Framer: an `h2` in the link), delasport (an `h3` next to "View & Apply") |
| An element with a title class (`title`, `position`, `name`) | ncube (`vacancies__title`, the link is empty), a-listware (`career-item__position` among the department and the location) |
| The link's own text on one line | headway (Teamtailor: the title is the link, the department below is longer) |
| The first line of the card | codebridge (the class `career-postiton` with a typo, the description below is longer) |
| The end of the address | an empty card: `senior-react-developer` → "senior react developer" |

Button text ("View & Apply", "See more", "Детальніше") is never a title. The location is not
taken: every site keeps it in a different place, and a guess would sometimes be the
department and sometimes a button.

**Checked on 13 real pages** from the analysis of 20.11.2026 (kinggroup, a-listware, xenoss,
eleks, intellias, ncube, codebridge, delasport, bspark, avenga, headway, boosters, growe): the
most likely group and the titles are right on all of them. The tests take four that cover
different title sources.

**Reading** (`readOwnPage`): one page, `externalId: null` - the vacancy key is built from the
address. **Zero vacancies by the recipe is `unreadable`**, not an empty list: otherwise a
site redesign would "close" every vacancy of the company. There is no pagination: none of the
13 pages had it in the HTML, and Load more is loaded by JavaScript - so what is visible is
what gets read, which is why the author gives addresses with filters already applied.

Relative links are resolved against the address after redirects (or `<base href>`) both when
finding groups and when reading, so the prefixes match.
