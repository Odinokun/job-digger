# src/server/discovery - finding career pages

Finds a company's career sources from its site address, for Find pages and Find new pages.
Every request goes through the single HTTP client ([`src/server/http`](../http/README.md)).

- The search runs whenever an address of any kind is added, even a ready career page:
  the company may have one more board.
- Regular vacancy checks do not repeat the search. Only Find new pages looks for new
  pages of companies without a source.
- **There is no external search API:** no reliable free options are left (the Google
  Custom Search API is closed to new customers and shuts down on 1 January 2027). If
  nothing is found, the career address is pasted by hand in the same dialog. If many
  companies end up in Not found, this is worth revisiting.

## Files

| File                | Role                                                          |
| ------------------- | ------------------------------------------------------------- |
| `discover.ts` | `discoverSources` - the search for Find pages (`discoverCompany` - the same, together with whether the company site answered): three methods, a trial read of every finding (only the first page, `more` means "there is more", task 6.16), one finding per board, ownership of findings by name; `isReliableFinding` - whether a finding can be relied on without a person |
| `discover.test.ts` | Unit tests of `isReliableFinding` |
| `new-pages.ts` | `decideNewPages` - Find new pages for one company: which findings to add without a person and which status to set (task 5.10) |
| `new-pages.test.ts` | Unit tests of `decideNewPages` |
| `discover.integration.test.ts` | `discoverSources` and `discoverCompany` through the fake web server, including a confirmed and a foreign board by name and a site that did not answer |
| `ownership.ts` | `boardOwnership` - whether a board page leads to the company site (confirmed), to another site, or unknown |
| `ownership.test.ts` | Unit tests of `boardOwnership` on the markup of real boards |
| `board-url.ts`      | `boardUrlOf` - a link to an ATS (a board, a vacancy, an application form, an embedded board) → the board address and the platform, including a known ATS without a parser; `boardKey` - what findings are merged by |
| `board-url.test.ts` | Unit tests of `boardUrlOf` for every platform                 |
| `ats-links.ts` | `atsLinksOnPage` - the ATS boards a page leads to: links, iframes and embed scripts, one per board in order of appearance; `findSiteAtsLinks` - the same for a site's home page through the HTTP client |
| `ats-links.test.ts` | Unit tests of `atsLinksOnPage` |
| `ats-links.integration.test.ts` | `findSiteAtsLinks` through the fake web server: the synthetic `acme.example` site and a site that does not exist |
| `career-pages.ts` | `careerPagesOnPage` - career pages of the site itself by link text, path or subdomain; `careerPagesInSitemap` - the same from sitemap addresses, by path only; `findSiteCareerPages` - the site's career pages and the ATS boards on them, including PeopleForce on the company's domain |
| `career-pages.test.ts` | Unit tests of finding career pages |
| `career-pages.integration.test.ts` | `findSiteCareerPages` through the fake web server (the synthetic `globex`, `initech`, `umbrella`, `acme`, `kramerica`, `vandelay`) and an own server with redirects |
| `by-name.ts` | `nameSlugs` - board name variants from the company name and domain; `findBoardsByName` - boards under these names on Greenhouse, Lever, Ashby, PeopleForce, Breezy HR, Hurma, Personio, softgarden, Workable, BambooHR and Pinpoint |
| `by-name.test.ts` | Unit tests of `nameSlugs` |
| `by-name.integration.test.ts` | `findBoardsByName` through the saved real boards of the fake web server |

## Board address

A finding is always a board, never a vacancy: a company site often links straight to
a single posting or an application form, and two vacancies of one board must give one
finding. The parsers' functions (`greenhouseBoardToken`, `leverSite`, `ashbyBoard`,
`workdaySite`, `peopleforceSite`) decide what counts as a board, so a found source is
read by the same code as one added by hand. There is one address form per platform:

| Platform    | Board address                                  |
| ----------- | ---------------------------------------------- |
| Greenhouse  | `https://job-boards.greenhouse.io/{token}`     |
| Lever       | `https://jobs.lever.co/{site}` (EU - `jobs.eu.lever.co`) |
| Ashby       | `https://jobs.ashbyhq.com/{board}`             |
| Workday     | the career site address without the language and the vacancy tail |
| PeopleForce | `https://{company}.peopleforce.io/careers`     |
| Breezy HR   | `https://{company}.breezy.hr`                  |
| Hurma       | `https://{company}.hurma.work/public-vacancies` |
| Personio    | `https://{company}.jobs.personio.de` (or `.com` - as in the link) |
| softgarden  | the old board `https://{company}.softgarden.io/en/vacancies`, the career site `https://{company}.career.softgarden.de` |
| BambooHR    | `https://{company}.bamboohr.com/careers`         |
| Pinpoint    | `https://{company}.pinpointhq.com/`              |
| TalentAdore | `https://ats.talentadore.com/positions/{token}/json` - there is no page for people; the address comes from the widget's `data-url` on the company page |
| Workable    | `https://apply.workable.com/{account}/`; the short vacancy link `/j/{shortcode}` does not contain the account - no finding |
| CleverStaff | `https://cleverstaff.net/i/{alias}-vacancies`; a vacancy link `/i/vacancy-{id}` stays as it is - the parser learns the company alias with a separate request |

## Known ATSs without a parser

A link to a platform that has no parser yet but whose domain is known (`knownAtsName`,
[`src/lib/companies/known-ats.ts`](../../lib/companies/known-ats.ts)) is also a
finding (task 5.15): the platform is `unsupported`, the trial read says "not supported
yet", and the findings list and the company card show the platform name. Find new pages
saves such an address as a source, and the company gets Unsupported. Without this the
search would silently skip a link to BambooHR, and the company would get Not found
although it has a career page.

We do not know the board form of such a platform, so the finding's address is the link
itself without the query string and the anchor, and there is one finding per platform
(`boardKey`): two vacancies of one BambooHR board would otherwise give two findings. A
page that leads to such a platform is not an own career page, the same as for boards
with a parser.

## Links from the site to an ATS

The most reliable method (task 5.02): the company's home page is loaded, and board
addresses are taken from it - from ordinary links, iframes (Ashby) and embed scripts
(Greenhouse). Relative addresses are resolved against the address after redirects
(`fetchText` returns that too).

The page is read without JavaScript. So a site that draws its career link with a script
(as of 19.11.2026 that is Linear, Discord, Palantir) gives nothing here - not an error,
just "not found this way". Checked on the real network: Notion (the careers page →
Ashby) and Webellian (the home page → PeopleForce) are found.

## Career pages on the site

The second method (task 5.03). The order goes from cheapest for the other site:

1. links from the home page already read - by text (the whole link text is a career
   phrase: Careers, Jobs, Karriere, Вакансії ...), by a path segment (`/careers`,
   `/karriere` ...) or by subdomain (`careers.`, `jobs.`);
2. without those - the common addresses `/careers` and `/jobs`;
3. without those - `/sitemap.xml`, only its `<url><loc>` (nested sitemaps are not read).

The pages found (up to three) are read. Links from them to an ATS become boards: that
is how Notion is found, whose link to Ashby is only on `/careers`. A page without an ATS
is the company's own page, and the trial read (5.06) decides whether it can be read.

**PeopleForce on the company's domain** (task 5.13) cannot be recognised by the link:
the host is the company's own, `peopleforce.softconstruct.com`. So a career page is also
checked for PeopleForce markup (`isPeopleForcePage`,
[parsers README](../parsers/README.md#peopleforce)):

- the page itself in that markup is the board `{origin}/careers`;
- a page without an ATS that leads to a career page **on another host of the same
  site** is one step further: that page is read (up to three), and if it is
  PeopleForce, it becomes the board instead of an own page. That is the case at
  SoftConstruct: `softconstruct.com/careers` → `peopleforce.softconstruct.com/careers`,
  215 vacancies.

Other ATSs on a company's own domain are not recognised this way - only when a real
source turns up.

What the real network taught us (19.11.2026):

- **Text as a whole phrase, not "contains the word".** Otherwise "Career guides" at
  Grammarly became a career page.
- **A redirect has to stay on careers.** Palantir's career link leads to an error page
  that answers 200. A page that lost the career word in its address after a redirect is
  dropped - and so is a `/careers` that redirects to the home page.
- **A redirect to another site stays.** At Grammarly `/careers` and `/jobs` lead to
  `superhuman.com/company/careers`: the company itself sends people there, and 5.05
  checks the ownership. Two addresses with one end give one finding.

Sites that draw their careers with JavaScript (Linear, Discord) give an own page without
a board, and Spotify gives nothing. The ATS search by name (5.04) covers those.

## ATS by name

The third, least reliable method (task 5.04). A finding is only "found by name - check":
the board `acme` may belong to a different Acme, so such findings are never added
automatically.

Board name variants (`nameSlugs`): the company name joined and hyphenated, plus the
first label of the domain, without `www` and `careers`. "Bosch UA" on `bosch.de/ua`
gives `boschua`, `bosch-ua`, `bosch`. Diacritics are removed, and a name without Latin
letters gives no variants.

Each variant is tried on Greenhouse, Lever, Ashby, PeopleForce, Breezy HR, Workable,
BambooHR, Pinpoint, Hurma, Personio (only `.de`: `.com` serves the same boards) and
softgarden (only the old `softgarden.io` board: career site addresses rarely equal the
name - `engineering-crown`, `jobs-gfo-online`). The check "is there a board" is reading
the board with the same parser as in a check: platforms answer 404 for a board that does
not exist (checked 19.11.2026, Workable 20.11.2026), and BambooHR answers with a redirect
to its own site, which the parser also takes as "no board". A Hurma page does not show
the company site (only the name and the logo), so a Hurma board found by name always
stays "found by name - check". CleverStaff is not tried by name: the alias is
case-sensitive (`MEV` exists, `mev` does not), and name variants are always lowercase.
As a side effect, the number of vacancies on the board is known. Workday is not guessed:
its address contains a cluster number and a site name.

On the real network (19.11.2026): Linear → Ashby, Discord → Greenhouse, Spotify and
Palantir → Lever, Monobank and Spribe → Hurma (since 3.26). Bosch UA has nothing by name.
Lever is read in pages with a politeness pause, so a big board takes ~14 s (Spotify - 91
vacancies, Palantir - 306).
