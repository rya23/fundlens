import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("splits a simple comma-separated row", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("unwraps a quoted field containing a comma", () => {
    expect(parseCsv('name,note\nAditya,"Large, Mid Cap"')).toEqual([
      ["name", "note"],
      ["Aditya", "Large, Mid Cap"],
    ]);
  });

  it("keeps an embedded newline inside a quoted field as part of the field", () => {
    const csv = 'name,note\nFund,"line one\nline two"';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Fund", "line one\nline two"],
    ]);
  });

  it("unescapes a doubled double-quote inside a quoted field", () => {
    const csv = 'name,note\nFund,"He said ""hi"""';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Fund", 'He said "hi"'],
    ]);
  });

  it("handles CRLF row separators", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("preserves a trailing empty field after a comma", () => {
    expect(parseCsv("a,b,\n1,2,")).toEqual([
      ["a", "b", ""],
      ["1", "2", ""],
    ]);
  });

  it("does not emit a phantom row for a trailing newline", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
