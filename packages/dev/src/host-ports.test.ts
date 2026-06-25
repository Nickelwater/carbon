import { describe, expect, it } from "vitest";
import {
  isPortInExcludedRange,
  parseWindowsExcludedPortRanges
} from "./host-ports.js";

describe("parseWindowsExcludedPortRanges", () => {
  it("parses netsh output lines", () => {
    const output = `
Protocol tcp Port Exclusion Ranges

Start Port    End Port
----------    --------
     54294       54393
     54394       54493
`;
    expect(parseWindowsExcludedPortRanges(output)).toEqual([
      { start: 54294, end: 54393 },
      { start: 54394, end: 54493 }
    ]);
  });
});

describe("isPortInExcludedRange", () => {
  const ranges = [{ start: 54294, end: 54393 }];

  it("flags ports inside a range", () => {
    expect(isPortInExcludedRange(54321, ranges)).toBe(true);
  });

  it("allows ports outside a range", () => {
    expect(isPortInExcludedRange(3000, ranges)).toBe(false);
  });
});
