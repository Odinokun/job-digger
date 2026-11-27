# src/lib/companies - company addresses and types

Pure functions that work with the address string itself: normalization before
comparison, the platform by host, suggestions for the fields of the Add company modal.
Plus the company list types and enums that both sides need. No network requests and
no database access - that is why both the server and client components import these
modules.

The server side of companies (duplicates in the database, lists, adding):
[`server/companies`](../../server/companies/README.md); the add company flow:
[`src/app/README.md`](../../app/README.md#adding-a-company).

## Files

| File          | What it holds                                                                  |
| ------------- | ------------------------------------------------------------------------------ |
| `url.ts`      | `normalizeCompanyUrl` - the address in comparable form, `companyUrlHost` - its host |
| `platform.ts` | `CAREER_PLATFORMS`, `detectPlatform` and `platformHostSuffix`                   |
| `known-ats.ts` | `knownAtsName` - the name of a known ATS without a parser by address (SmartRecruiters, Teamtailor ...); the domain list and why only domains are in the file's comments |
| `suggest.ts`  | `suggestCompanyFields` - suggestions for the modal fields from one address       |
| `career-source.ts` | `prepareCareerSource` - a source's address, label, platform and duplicate within the company |
| `name.ts`     | `normalizeCompanyName` and `sameCompanyName` - when two names are one company    |
| `company-list.ts` | List row types, the tab and `discovery_status` enums, `parseCompaniesTab`, `matchesCompanySearch` - the All tab search rule on the client, the same as in the query |
| `company-status.ts` | `companyCheckStatus` - the status on Tracked: OK, Has errors, Checking or nothing before the first check; `cardStatusBadge` - which state gets the card's single coloured badge, while unread pages are shown as text (UI audit, A6) |

## Why this is not in `src/server`

The Add company modal is a client component, and it needs the suggestions right away,
when the address field loses focus: there is no reason to send a request to the server
just to parse a string. The project rule "modules from `src/server` are not imported
into client components" stays intact, because this is shared code, not server code.

The boundary is kept by dependencies, not by words: this folder has nothing from
`drizzle-orm`, `src/server` or Node APIs. The platform list lives here too, and
`pgEnum("career_platform")` in the schema is built from it - otherwise the client
would pull in the schema together with Drizzle, and the values in the database and in
the code could drift apart.

For the same reason the company list row types and the `DISCOVERY_STATUSES` list,
from which `pgEnum("discovery_status")` is built, live here: the company list
accumulates Load more pages, so it is a client component, and the `CompanyListItem`
and `CompaniesTab` types are needed both by it and by the queries in
[`server/companies/list.ts`](../../server/companies/README.md). The enum values did not
change in the move, so it needed no migration - checked with `drizzle-kit generate`
against a copy of the migrations folder ("No schema changes").

## What address normalization does

| Input                       | Result                 | Why                                                           |
| --------------------------- | ---------------------- | ------------------------------------------------------------- |
| `HTTPS://WWW.Bosch.com/`    | `bosch.com`            | the protocol, `www.` and a trailing slash do not make another company |
| `bosch.com/DE/`             | `bosch.com/DE`         | the path stays, case included                                  |
| `bosch.com/de?lang=de#top`  | `bosch.com/de?lang=de` | the fragment never reaches the server, the query is sometimes the only difference |
| `   ` (empty)               | `empty` refusal        | -                                                             |
| `не адреса`                 | `not-a-url` refusal    | -                                                             |
| `ftp://bosch.com`           | `unsupported-scheme` refusal | we only fetch http and https                            |

The path is kept because `bosch.com/de` and `bosch.com/ua` are different companies,
for example national versions. The path case is kept too: in HTTP the path is
case-sensitive, and only the domain is case-insensitive. A consequence worth knowing:
`bosch.com/DE` and `bosch.com/de` are added as two companies.

**A result object, not an exception.** A broken address is expected user input, not
an exceptional situation: the add form has to show a field error, and the
`{ ok: false; reason }` type forces that case to be handled.

**Parsing with `URL`, not regular expressions.** The standard parser itself lowercases
the host, drops the default port and converts internationalised domains to punycode.
If there is no protocol, `https://` is added - otherwise `new URL` cannot parse the
string.

## Source platform by address

The platform is derived from the address the user entered: before automatic search
(stage 5) no source added by hand could otherwise be tracked, and the Tracked tab
would have stayed out of reach.

**The domain label boundary is compared**, not the end of the string: `host === suffix
|| host.endsWith("." + suffix)`. With a plain `endsWith` anyone could name a domain
`not-greenhouse.io`, and we would take it for a Greenhouse board.

**The list holds only the platform's own hosts.** An ATS customer's custom domain
(`jobs.company.com`) gives `unsupported` - the address says nothing about it. The server
recognises PeopleForce on such a domain by page content (task 5.13,
[`server/companies`](../../server/companies/README.md#decisions)): here, without a
network, that is impossible, so the Edit modal shows such an address as Unsupported
until Save. Likewise `schema_org` is never returned: JobPosting markup is visible only
in the page content (its parser is task 3.11). Neither is `own_page`: a person makes a
page an own page by confirming a recipe (task 6.21).

| Host suffix                             | Platform    |
| --------------------------------------- | ----------- |
| `greenhouse.io`                         | greenhouse  |
| `lever.co`                              | lever       |
| `ashbyhq.com`                           | ashby       |
| `myworkdayjobs.com`, `myworkdaysite.com` | workday    |
| `peopleforce.io`                        | peopleforce |
| `breezy.hr`                             | breezy      |
| `cleverstaff.net`                       | cleverstaff |
| `hurma.work`                            | hurma       |
| `jobs.personio.de`, `jobs.personio.com` | personio |
| `softgarden.io`, `career.softgarden.de` | softgarden |
| `workable.com` | workable |
| `bamboohr.com` | bamboohr |
| `pinpointhq.com` | pinpoint |
| `ats.talentadore.com` | talentadore |
| anything else                           | unsupported |

Where the domains come from is in the comment on `PLATFORM_DOMAINS`: Greenhouse
officially documents only `boards.greenhouse.io`, the other hosts were checked with
requests.

## A new source for an existing company

`prepareCareerSource` is the shared part of two entry points to one action: the "add a
career page" field in the Edit modal and the offer in Add company when the pasted
address matches an already added company (card 2.16). The deduplication rule lives
here so the two do not drift apart.

**A duplicate is a match of normalized addresses** within **one** company.
`https://www.mozilla.org/careers/` and `mozilla.org/careers` are the same source, while
two links that differ only in `query` are different: `normalizeCompanyUrl` keeps the
`query` precisely because it tells page filters and national versions apart. The same
source in another company is not a duplicate here - `career_sources` has no unique
index on purpose ([database README](../../server/db/README.md)).

**The check is friendly, not atomic.** The list of existing addresses comes from the
database, which has no uniqueness for it, so two simultaneous Saves could in theory add
a duplicate source. The Remove button cleans it up, so the price is a row in the list,
not lost data. A column with the normalized address and a unique index were left out on
purpose: the normalization rule lives in JS, and filling a new column for existing rows
would need a separate helper script.

**Unusable addresses in the existing list simply match nothing.** There is no reason to
fail on them: the database builds the list, not the form.

**The label is brought to the database form here too:** it is trimmed, and an empty
one becomes `null` - "no label", not an empty string.

## Suggestions for the Add company fields

`suggestCompanyFields` parses one pasted address and returns what to put into the modal
fields. There are no network requests: everything is visible from the string.

| Pasted                     | Main site     | Name   | Career page                |
| -------------------------- | ------------- | ------ | -------------------------- |
| `bosch.com`                | `bosch.com`   | Bosch  | -                          |
| `bosch.com/de/careers/jobs`| `bosch.com`   | Bosch  | `bosch.com/de/careers/jobs`|
| `bosch.com/de`             | `bosch.com/de`| Bosch  | -                          |
| `about.gitlab.com`         | `about.gitlab.com` | Gitlab | -                     |
| `jobs.lever.co/spotify`    | -             | Spotify| `jobs.lever.co/spotify`    |
| `bosch.wd3.myworkdayjobs.com/External` | - | Bosch | the same address         |

**The name is the second-to-last domain label**, with a step back on second-level
domains (`bosch.com.ua` is Bosch, otherwise it would come out as "Com"). The list of
such suffixes is short and lives in the code: the full Public Suffix List is updated
separately from us, and the gain from it here is a few rare domains. Abbreviations are
not recognised: `bbc.co.uk` gives "Bbc".

**Everything after the domain goes into the career page field.** The main site is cut
down to the domain, and without this the pasted path would simply be lost. The rule
deliberately does not guess by words in the path (`careers`, `jobs`): such a list would
have to be kept up and extended, for a gain only in edge cases.

**The exception is a national version of a site.** A single-segment path that looks
like a language code (`de`, `uk`, `en-US`, `de-de`) stays in the site field, and the
career field is not filled: `bosch.com/de` is the main site, and cut down to
`bosch.com` it leads to another, global one. The segment's form is recognised, not the
ISO 639-1 list: the list would have to grow to every code and be kept current. The price
is that `bosch.com/hr` (Croatia or an HR section) is guessed wrong, and that is
accepted: the fields are editable, so a mistake costs one manual fix instead of two. A
query does not cancel the heuristic - sometimes it is what sets the version
(`bosch.com/de?lang=de`).

**An ATS address gives no main site.** `lever.co` is not Spotify's site, and
`spotify.com` cannot be derived from the slug: it may be `.io`, `.ai` or another slug.
The field stays empty - the user fills it in, or, since stage 5, Find pages. Putting the
ATS address itself there will not do either: then every company on Lever would look
like one domain, and the same domain warning would lose its meaning.

**Where the name sits in an ATS address depends on the platform.** In Greenhouse, Lever,
Ashby and Workable it is the first path segment; in Workday, PeopleForce, Breezy HR,
Hurma, Personio, softgarden, BambooHR and Pinpoint it is the subdomain
(`bosch.wd3.myworkdayjobs.com`); in CleverStaff it is the second path segment without
`-vacancies` (`cleverstaff.net/i/8allocate-vacancies`). There is still one list of
platform domains - in `platform.ts`; `suggest.ts` takes the suffix from it through
`platformHostSuffix` to tell company labels from platform labels. An address without a
slug (`jobs.lever.co`) gives no name.

## When two names are one company

`sameCompanyName` drops case and everything that is not a letter or a digit, so
"Rolls-Royce", "Rolls Royce", "RollsRoyce" and "rollsRoyce" are one company. This
appeared together with companies without a site (card 2.17) and stayed: two cards of one
company may share no address - `linear.app` and `linear.io` are different domains, and
their sources differ. The name remains the only shared signal.

**`\p{L}` instead of `a-z`:** company names are not translated, so "Нова Пошта" has to
stay a name rather than turn into an empty string.

**A name match is a warning, not a ban.** "Ernst & Young" and "ErnstYoung" match, but so
do two really different companies with the same name. The decision stays with the user
- as with a shared domain.

**The rule lives here, not in SQL.** The comparison is done by
[`findCompaniesByName`](../../server/companies/duplicates.ts), which reads the user's
companies and filters them in memory: this way the rule sits next to
`suggestCompanyFields`, which derives the name, and is not duplicated as a
`regexp_replace` expression that, besides, treats non-Latin text differently depending
on the database locale.
