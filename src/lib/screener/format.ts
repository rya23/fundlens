import { getNumericColumn, type NumericColumnId } from "./columns";

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(decimals: number): Intl.NumberFormat {
  let f = formatters.get(String(decimals));
  if (!f) {
    // en-IN gives lakh/crore grouping for AUM; signDisplay "negative" keeps
    // "-0.0" from showing as a signed zero.
    f = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      signDisplay: "negative",
    });
    formatters.set(String(decimals), f);
  }
  return f;
}

export const EMPTY_CELL = "–";

/** Bare number for a table cell; the unit lives in the column header. */
export function formatCell(id: NumericColumnId, value: number | null): string {
  if (value === null) return EMPTY_CELL;
  return formatter(getNumericColumn(id).decimals).format(value);
}

/** Number with its unit, for filter chips and the range editor. */
export function formatWithUnit(id: NumericColumnId, value: number): string {
  const col = getNumericColumn(id);
  const text = formatter(col.decimals).format(value);
  switch (col.format) {
    case "percent":
      return `${text}%`;
    case "crore":
      return `₹${text} Cr`;
    case "years":
      return `${text} yrs`;
    default:
      return text;
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "31 Oct 2026" from an ISO calendar date, independent of the viewer's timezone. */
export function formatIsoDate(iso: string): string {
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
}

export function formatCount(n: number): string {
  return formatter(0).format(n);
}
