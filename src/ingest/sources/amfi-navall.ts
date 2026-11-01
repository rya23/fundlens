/**
 * Parser for AMFI's `NAVAll.txt` (https://portal.amfiindia.com/spages/NAVAll.txt),
 * used for the nightly NAV increment (see `docs/PLAN.md` "Data sources").
 *
 * The file is not a clean table: it's a `;`-separated data block with the
 * column header on line 1, then repeated groups of
 *
 *   <Scheme Type> Schemes(<Category>)
 *   <blank>
 *   <AMC name>
 *   <blank>
 *   <code>;<isinGrowth>;<isinReinvestment>;<name>;<plan>;<option>;<nav>;<date>
 *   ...
 *
 * with a blank line (a single space, or truly empty) between records and
 * between AMC blocks. AMFI is not internally consistent about the category
 * text: the same SEBI category appears verbatim under both "Equity Scheme -"
 * and "Equity Schemes -" headers depending on when the row was added, and
 * some very old (pre-2013 Direct/Regular split) rows have empty Plan and
 * Option fields. This parser preserves all of that verbatim - it does not
 * normalise category, plan, or option text; that's `classify.ts`'s job.
 */

export interface AmfiNavRecord {
  schemeCode: number;
  isinGrowth: string | null;
  isinDivReinvestment: string | null;
  schemeName: string;
  /** Raw plan text as AMFI wrote it (e.g. "Direct Plan"), or null for legacy rows with no plan/option split. */
  plan: string | null;
  /** Raw option text as AMFI wrote it (e.g. "Growth", "Annual IDCW"), or null for legacy rows. */
  option: string | null;
  /** Null when AMFI published "N.A." for the day (e.g. a suspended/under-winding-up scheme). */
  nav: number | null;
  /** ISO `yyyy-mm-dd`. */
  date: string;
  /** Raw scheme-type header text, e.g. "Open Ended Schemes". */
  schemeType: string;
  /** Raw category text as it appeared in the section header, verbatim (not normalised). */
  category: string;
  /** AMC / fund house name from the most recent AMC header line. */
  amc: string;
}

const SECTION_HEADER = /^(Open Ended|Close Ended|Interval Fund) Schemes?\s*\*{0,2}\s*\(([^)]*)\)\s*$/;

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** Converts AMFI's "DD-Mon-YYYY" (e.g. "30-Oct-2026") to ISO "yyyy-mm-dd". */
function toIsoDate(ddMonYyyy: string): string {
  const [day, mon, year] = ddMonYyyy.trim().split("-");
  const month = MONTHS[mon.toLowerCase()];
  if (!day || !month || !year) {
    throw new Error(`Unrecognised AMFI date format: "${ddMonYyyy}"`);
  }
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function parseIsin(field: string): string | null {
  const trimmed = field.trim();
  return trimmed === "" || trimmed === "-" ? null : trimmed;
}

function parseNav(field: string): number | null {
  const trimmed = field.trim();
  if (trimmed === "" || /^n\.?a\.?$/i.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** Parses the full text of AMFI's NAVAll.txt into typed, un-normalised records. */
export function parseAmfiNavAll(text: string): AmfiNavRecord[] {
  const records: AmfiNavRecord[] = [];
  const lines = text.split(/\r\n|\r|\n/);

  let schemeType = "";
  let category = "";
  let amc = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.startsWith("Scheme Code;")) continue; // the one column-header line

    const sectionMatch = SECTION_HEADER.exec(line);
    if (sectionMatch) {
      schemeType = `${sectionMatch[1]} Schemes`;
      category = sectionMatch[2].trim();
      amc = ""; // a new section always starts with a fresh AMC header line
      continue;
    }

    if (!line.includes(";")) {
      // Not a data row and not a section header: an AMC name.
      amc = line;
      continue;
    }

    const fields = line.split(";");
    if (fields.length < 8) continue; // malformed/truncated row; skip rather than crash the whole file

    const [codeField, isinGrowthField, isinReinvField, nameField, planField, optionField, navField, dateField] =
      fields;
    const schemeCode = Number(codeField.trim());
    if (!Number.isInteger(schemeCode) || schemeCode <= 0) continue;

    records.push({
      schemeCode,
      isinGrowth: parseIsin(isinGrowthField),
      isinDivReinvestment: parseIsin(isinReinvField),
      schemeName: nameField.trim(),
      plan: planField.trim() === "" ? null : planField.trim(),
      option: optionField.trim() === "" ? null : optionField.trim(),
      nav: parseNav(navField),
      date: toIsoDate(dateField),
      schemeType,
      category,
      amc,
    });
  }

  return records;
}
