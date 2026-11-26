import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { normalizeCompanyUrl } from "../../lib/companies/url.ts";
import { careerSources, companies } from "./schema.ts";

/**
 * A demo company's career source: without `companyId`, which the insert provides.
 * `normalizedUrl` is not set by hand either - the same function as adding a
 * source by hand computes it.
 */
type DemoSource = Omit<
  typeof careerSources.$inferInsert,
  "id" | "companyId" | "normalizedUrl" | "createdAt" | "lastSuccessAt"
> & {
  /** How many days ago the source was last read without an error. */
  lastSuccessDaysAgo?: number;
};

/**
 * A demo company. `normalizedUrl` is not set by hand: the same function as
 * adding a company by hand computes it.
 */
type DemoCompany = Omit<
  typeof companies.$inferInsert,
  "id" | "userId" | "url" | "normalizedUrl" | "createdAt"
> & {
  /** The main site - required, as in the schema. */
  url: string;
  sources: DemoSource[];
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * A set of companies for manually testing the Companies page.
 *
 * The addresses are real and verified: in stage 3 the same set is needed to run
 * the parsers and Check now on real pages. Statuses and error counters are set
 * by hand - no check has computed them yet.
 *
 * The set covers every state of the list: both tabs, a company with two sources,
 * a company with errors and each `discovery_status` value of the Not tracked tab.
 * There is no `schema_org` platform here yet - it comes with parser 3.11.
 */
export const DEMO_COMPANIES: DemoCompany[] = [
  {
    name: "GitLab",
    url: "https://about.gitlab.com",
    sources: [
      {
        url: "https://job-boards.greenhouse.io/gitlab",
        platform: "greenhouse",
        lastSuccessDaysAgo: 1,
      },
    ],
  },
  {
    // A company with two sources: a Lever board and an own page nothing can
    // read. Progress and Retry are counted per source, so manual testing needs
    // such a case.
    name: "Spotify",
    url: "https://www.spotify.com",
    sources: [
      {
        url: "https://jobs.lever.co/spotify",
        platform: "lever",
        lastSuccessDaysAgo: 1,
      },
      {
        url: "https://www.lifeatspotify.com/jobs",
        platform: "unsupported",
        isTracked: false,
      },
    ],
  },
  {
    name: "Linear",
    url: "https://linear.app",
    sources: [
      {
        url: "https://jobs.ashbyhq.com/linear",
        platform: "ashby",
        lastSuccessDaysAgo: 2,
      },
    ],
  },
  {
    name: "NVIDIA",
    url: "https://www.nvidia.com",
    sources: [
      {
        url: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
        platform: "workday",
        lastSuccessDaysAgo: 3,
      },
    ],
  },
  {
    // A source with errors: shows "Has errors" and "Last ok: 12 days ago".
    name: "Palantir",
    url: "https://www.palantir.com",
    sources: [
      {
        url: "https://jobs.lever.co/palantir",
        platform: "lever",
        consecutiveFailures: 3,
        lastSuccessDaysAgo: 12,
      },
    ],
  },
  {
    name: "PeopleForce",
    url: "https://peopleforce.io",
    sources: [
      {
        // PeopleForce itself: `careers.peopleforce.io` leads to a 404, the career
        // page is on the `team` subdomain (checked 18.11.2026).
        url: "https://team.peopleforce.io/careers",
        platform: "peopleforce",
        lastSuccessDaysAgo: 1,
      },
    ],
  },
  {
    // A page was found but nothing can read it: the company stays in Not tracked,
    // and the address is kept - it will be useful if new ways of reading appear.
    name: "Google",
    url: "https://www.google.com",
    discoveryStatus: "unsupported",
    sources: [
      {
        url: "https://careers.google.com",
        platform: "unsupported",
        isTracked: false,
      },
    ],
  },
  {
    name: "Berkshire Hathaway",
    url: "https://www.berkshirehathaway.com",
    discoveryStatus: "not_found",
    sources: [],
  },
  {
    name: "Valve",
    url: "https://www.valvesoftware.com",
    discoveryStatus: "check_failed",
    sources: [],
  },
];

/** How many rows this run actually inserted. */
export type DemoSeedResult = {
  companies: number;
  sources: number;
};

/**
 * Adds the demo companies to a user and returns the number of rows inserted.
 *
 * The database is passed as an argument, as in `seedSystemUser`: this way the
 * same function works on the development database (`npm run db:seed:demo`) and
 * on the test database.
 *
 * Running it several times is safe. The unique index `(user_id, normalized_url)`
 * guards a company, so `onConflictDoNothing()` is enough for it. `career_sources`
 * has no unique index on purpose (see the README), so sources are inserted only
 * together with a new company: the script does not touch an existing company at
 * all, nor any source added or removed by hand.
 */
export async function seedDemoCompanies(
  db: NodePgDatabase,
  userId: string,
): Promise<DemoSeedResult> {
  const seededAt = Date.now();

  return db.transaction(async (tx) => {
    const result: DemoSeedResult = { companies: 0, sources: 0 };

    for (const demo of DEMO_COMPANIES) {
      const normalized = normalizeCompanyUrl(demo.url);

      if (!normalized.ok) {
        throw new Error(
          `Demo company "${demo.name}" has an unusable url: ${demo.url} (${normalized.reason})`,
        );
      }

      const [company] = await tx
        .insert(companies)
        .values({
          userId,
          name: demo.name,
          url: demo.url,
          normalizedUrl: normalized.url,
          discoveryStatus: demo.discoveryStatus,
        })
        .onConflictDoNothing()
        .returning();

      // The company already existed: neither it nor its sources are touched.
      if (!company) {
        continue;
      }

      result.companies += 1;

      if (demo.sources.length === 0) {
        continue;
      }

      const inserted = await tx
        .insert(careerSources)
        .values(
          demo.sources.map(({ lastSuccessDaysAgo, ...source }) => ({
            ...source,
            companyId: company.id,
            normalizedUrl: demoSourceNormalizedUrl(demo.name, source.url),
            lastSuccessAt:
              lastSuccessDaysAgo === undefined
                ? null
                : new Date(seededAt - lastSuccessDaysAgo * DAY_IN_MS),
          })),
        )
        .returning();

      result.sources += inserted.length;
    }

    return result;
  });
}

/**
 * The normalized address of a demo source. An unusable address here is a bug in
 * the demo data itself, hence an exception rather than a silent skip: the same
 * rule as for a company address.
 */
function demoSourceNormalizedUrl(companyName: string, url: string): string {
  const normalized = normalizeCompanyUrl(url);

  if (!normalized.ok) {
    throw new Error(
      `Demo company "${companyName}" has an unusable career source url: ${url} (${normalized.reason})`,
    );
  }

  return normalized.url;
}
