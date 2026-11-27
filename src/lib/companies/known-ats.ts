/**
 * Known ATS without a parser (task 5.15): platforms the search recognises by domain
 * but cannot read yet. A link from a company site to such a platform is not a
 * foreign link but a career page, which we save as an unsupported source with the
 * platform name. This shows which parsers are really needed.
 *
 * Domains only, without a board address form: vendor documentation mostly does not
 * describe address templates. That is why there is one finding per platform
 * (`src/server/discovery/ats-links.ts`), not one per board.
 *
 * A platform with a parser must not be here: `platform.ts` recognises it. A new
 * parser removes its line from here (src/server/parsers/README.md, "How to add a
 * platform").
 */

/**
 * Pattern → platform name:
 *
 * - with a leading dot - any subdomain (`.teamtailor.com` -
 *   `acme.teamtailor.com`, the company in the subdomain);
 * - without a dot - exactly this host (`jobs.jobvite.com/acme`, the company in the path);
 * - with a path - this host and an address starting with this path
 *   (`join.com/companies/`): the platform keeps boards on the same host as its
 *   own site.
 *
 * The domain itself and `www.` do not count as a subdomain: that is the vendor's
 * site, which "Powered by ..." links to, not a company board.
 *
 * The hosts were checked with real requests on 19.11.2026: the host answers and
 * belongs to this vendor, and for the platforms of task 5.15 (Ukraine and Germany)
 * it also leads to a real career page (BITE, Umantis - the vendors' own pages;
 * d.vinci - the client `impulse`).
 */
const KNOWN_ATS: Array<[pattern: string, name: string]> = [
  ["jobs.smartrecruiters.com", "SmartRecruiters"],
  ["careers.smartrecruiters.com", "SmartRecruiters"],
  [".recruitee.com", "Recruitee"],
  [".teamtailor.com", "Teamtailor"],
  [".applytojob.com", "JazzHR"],
  ["jobs.jobvite.com", "Jobvite"],
  [".icims.com", "iCIMS"],
  [".taleo.net", "Oracle Taleo"],
  [".successfactors.com", "SAP SuccessFactors"],
  [".successfactors.eu", "SAP SuccessFactors"],
  ["ats.rippling.com", "Rippling"],
  [".homerun.co", "Homerun"],
  [".factorialhr.com", "Factorial"],
  ["jobs.gem.com", "Gem"],
  ["jobs.dover.com", "Dover"],
  ["app.dover.com", "Dover"],
  [".ultipro.com", "UKG Pro"],
  [".dayforcehcm.com", "Dayforce"],
  ["recruiting.paylocity.com", "Paylocity"],
  // Germany (task 5.15). rexx is not here: its clients keep the career page on
  // their own domain (task 5.13).
  ["jobs.b-ite.com", "BITE"],
  [".onlyfy.jobs", "onlyfy"],
  ["jobs.umantis.com", "Umantis"],
  [".dvinci-hr.com", "d.vinci"],
  ["join.com/companies/", "JOIN"],
];

/**
 * The name of a known ATS without a parser that the address leads to, or `null`.
 * Accepts both an absolute address and a normalized one (`acme.bamboohr.com`), as
 * the database stores it.
 */
export function knownAtsName(url: string): string | null {
  const parsed = parse(url);

  if (parsed === null) {
    return null;
  }

  const { host, path } = parsed;
  for (const [pattern, name] of KNOWN_ATS) {
    const slash = pattern.indexOf("/");
    if (slash !== -1) {
      if (
        host === pattern.slice(0, slash) &&
        path.startsWith(pattern.slice(slash))
      ) {
        return name;
      }
    } else if (pattern.startsWith(".")) {
      const domain = pattern.slice(1);
      if (host.endsWith(pattern) && host !== `www.${domain}`) {
        return name;
      }
    } else if (host === pattern) {
      return name;
    }
  }

  return null;
}

function parse(url: string): { host: string; path: string } | null {
  try {
    const absolute = /^[a-z][a-z\d+.-]*:\/\//i.test(url)
      ? url
      : `https://${url}`;
    const parsed = new URL(absolute);
    return { host: parsed.hostname.toLowerCase(), path: parsed.pathname };
  } catch {
    return null;
  }
}
