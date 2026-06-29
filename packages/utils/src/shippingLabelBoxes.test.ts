import { describe, expect, it } from "vitest";
import {
  getShippingLabelPackageCount,
  isSinglePackageShippingLabelRequest,
  splitQuantityIntoBoxes
} from "./shippingLabelBoxes";

describe("splitQuantityIntoBoxes", () => {
  it("splits evenly into full boxes", () => {
    expect(splitQuantityIntoBoxes(500, 250)).toEqual([250, 250]);
  });

  it("includes a partial box for the remainder", () => {
    expect(splitQuantityIntoBoxes(550, 250)).toEqual([250, 250, 50]);
  });

  it("returns a single partial box when shipped qty is less than box qty", () => {
    expect(splitQuantityIntoBoxes(50, 250)).toEqual([50]);
  });

  it("returns one full box when quantities match", () => {
    expect(splitQuantityIntoBoxes(250, 250)).toEqual([250]);
  });

  it("falls back to shipped quantity when box quantity is invalid", () => {
    expect(splitQuantityIntoBoxes(100, 0)).toEqual([100]);
    expect(splitQuantityIntoBoxes(100, -5)).toEqual([100]);
  });

  it("returns empty array for non-positive shipped quantity", () => {
    expect(splitQuantityIntoBoxes(0, 250)).toEqual([]);
    expect(splitQuantityIntoBoxes(-10, 250)).toEqual([]);
  });
});

describe("isSinglePackageShippingLabelRequest", () => {
  it("treats default 1/1 as print-all", () => {
    expect(isSinglePackageShippingLabelRequest(1, 1)).toBe(false);
  });

  it("treats missing params as print-all", () => {
    expect(isSinglePackageShippingLabelRequest()).toBe(false);
    expect(isSinglePackageShippingLabelRequest(1)).toBe(false);
  });

  it("detects an explicit single-package request", () => {
    expect(isSinglePackageShippingLabelRequest(2, 3)).toBe(true);
    expect(isSinglePackageShippingLabelRequest(1, 3)).toBe(true);
    expect(isSinglePackageShippingLabelRequest(2, 2)).toBe(true);
  });
});

describe("getShippingLabelPackageCount", () => {
  it("counts labels including partial boxes", () => {
    expect(getShippingLabelPackageCount(550, 250)).toBe(3);
    expect(getShippingLabelPackageCount(500, 250)).toBe(2);
    expect(getShippingLabelPackageCount(50, 250)).toBe(1);
  });

  it("returns 1 when box quantity is not set", () => {
    expect(getShippingLabelPackageCount(550, null)).toBe(1);
    expect(getShippingLabelPackageCount(550, undefined)).toBe(1);
  });
});
