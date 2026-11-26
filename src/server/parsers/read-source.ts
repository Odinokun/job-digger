/**
 * Choosing a parser by the source platform: the single point through which a
 * check reads any source.
 */
import type { CareerPlatform } from "../../lib/companies/platform.ts";
import type { HttpClient } from "../http/client.ts";
import { readAshby } from "./ashby.ts";
import { readBambooHr } from "./bamboohr.ts";
import { readBreezy } from "./breezy.ts";
import { readCleverStaff } from "./cleverstaff.ts";
import { readGreenhouse } from "./greenhouse.ts";
import { readHurma } from "./hurma.ts";
import { readPersonio } from "./personio.ts";
import { readSoftgarden } from "./softgarden.ts";
import { readTalentAdore } from "./talentadore.ts";
import { readLever } from "./lever.ts";
import { readOwnPage } from "./own-page.ts";
import { readPeopleForce } from "./peopleforce.ts";
import { readPinpoint } from "./pinpoint.ts";
import type { ParseResult } from "./types.ts";
import type { ReadDepth } from "./vacancies-to-check.ts";
import { readWorkable } from "./workable.ts";
import { readWorkday } from "./workday.ts";

/**
 * Depth (`depth`) is needed only by parsers that read in pages; the rest return
 * the whole list in one request and do not take it.
 */
type Reader = (
  sourceUrl: string,
  client: HttpClient,
  depth: ReadDepth,
) => Promise<ParseResult>;

/**
 * The parsers that exist. A platform without a parser is missing here rather
 * than stubbed with an error: a source nothing can read is not a failed check
 * but one not built yet (schema.org is task 3.11).
 */
const READERS: Partial<Record<CareerPlatform, Reader>> = {
  greenhouse: readGreenhouse,
  ashby: readAshby,
  lever: (sourceUrl, client, depth) => readLever(sourceUrl, client, { depth }),
  workday: (sourceUrl, client, depth) =>
    readWorkday(sourceUrl, client, { depth }),
  peopleforce: (sourceUrl, client, depth) =>
    readPeopleForce(sourceUrl, client, { depth }),
  breezy: readBreezy,
  cleverstaff: readCleverStaff,
  hurma: (sourceUrl, client, depth) => readHurma(sourceUrl, client, { depth }),
  personio: readPersonio,
  softgarden: readSoftgarden,
  workable: readWorkable,
  bamboohr: readBambooHr,
  pinpoint: readPinpoint,
  talentadore: readTalentAdore,
};

/**
 * The source's vacancies, or `null` if the platform has no parser yet.
 *
 * An own page (`own_page`, task 6.21) is read not by platform but by the source's
 * recipe, `vacancyLinkPrefix`, so it is outside `READERS`. Without a recipe
 * nothing can read it - `unreadable`: the recipe and the platform are written
 * together, and such a row should not exist.
 */
export async function readSource(
  source: {
    url: string;
    platform: CareerPlatform;
    vacancyLinkPrefix?: string | null;
  },
  client: HttpClient,
  depth: ReadDepth = "full",
): Promise<ParseResult | null> {
  if (source.platform === "own_page") {
    return source.vacancyLinkPrefix == null
      ? { ok: false, error: { reason: "unreadable" } }
      : readOwnPage(source.url, source.vacancyLinkPrefix, client);
  }

  const reader = READERS[source.platform];

  return reader === undefined ? null : reader(source.url, client, depth);
}
