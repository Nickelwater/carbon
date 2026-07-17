import { describe, expect, it } from "vitest";
import { computeCapabilityIndices, computeIMRChart } from "./spc";

describe("computeIMRChart", () => {
  it("returns individuals and moving ranges for a numeric series", () => {
    const chart = computeIMRChart([10.1, 10.3, 9.9, 10.2]);

    expect(chart).toHaveLength(4);
    expect(chart[0]).toEqual({
      index: 0,
      individual: 10.1,
      movingRange: null
    });
    expect(chart[1]!.movingRange).toBeCloseTo(0.2, 10);
    expect(chart[2]!.movingRange).toBeCloseTo(0.4, 10);
    expect(chart[3]!.movingRange).toBeCloseTo(0.3, 10);
  });

  it("returns null moving range for the first point", () => {
    expect(computeIMRChart([5])[0]).toEqual({
      index: 0,
      individual: 5,
      movingRange: null
    });
  });
});

describe("computeCapabilityIndices", () => {
  const values = [9.8, 10.1, 10.0, 9.9, 10.2, 10.1, 9.7, 10.0];

  it("computes Cp, Cpk, Pp, and Ppk when limits and variation exist", () => {
    const result = computeCapabilityIndices({
      values,
      lsl: 9.5,
      usl: 10.5
    });

    expect(result.mean).toBeCloseTo(9.975, 3);
    expect(result.sigmaWithin).toBeGreaterThan(0);
    expect(result.sigmaOverall).toBeGreaterThan(0);
    expect(result.cp).not.toBeNull();
    expect(result.cpk).not.toBeNull();
    expect(result.pp).not.toBeNull();
    expect(result.ppk).not.toBeNull();
  });

  it("returns null capability indices when n is insufficient", () => {
    expect(
      computeCapabilityIndices({
        values: [10],
        lsl: 9.5,
        usl: 10.5
      })
    ).toEqual({
      mean: 10,
      sigmaWithin: null,
      sigmaOverall: null,
      cp: null,
      cpk: null,
      pp: null,
      ppk: null
    });
  });

  it("returns null capability indices when sigma is zero", () => {
    expect(
      computeCapabilityIndices({
        values: [10, 10, 10, 10],
        lsl: 9.5,
        usl: 10.5
      })
    ).toEqual({
      mean: 10,
      sigmaWithin: 0,
      sigmaOverall: 0,
      cp: null,
      cpk: null,
      pp: null,
      ppk: null
    });
  });

  it("returns null Cp/Pp when either spec limit is missing", () => {
    const oneSided = computeCapabilityIndices({
      values,
      usl: 10.5
    });

    expect(oneSided.cp).toBeNull();
    expect(oneSided.pp).toBeNull();
    expect(oneSided.cpk).not.toBeNull();
    expect(oneSided.ppk).not.toBeNull();
  });

  it("returns null indices when both spec limits are missing", () => {
    expect(
      computeCapabilityIndices({
        values
      })
    ).toEqual({
      mean: expect.any(Number),
      sigmaWithin: expect.any(Number),
      sigmaOverall: expect.any(Number),
      cp: null,
      cpk: null,
      pp: null,
      ppk: null
    });
  });
});
