import { labelSizes } from "@carbon/utils";
import { describe, expect, it } from "vitest";
import { generateShippingLabelZPL } from "./ShippingLabelZPL";
import type { ShippingLabelItem } from "./shippingLabelTypes";

const label4x6 = labelSizes.find((size) => size.id === "label4x6")!;

const sample: ShippingLabelItem = {
  partNumber: "01-0129",
  revision: "4",
  quantity: "546EA",
  quantityBarcode: "546",
  purchaseOrder: "51202",
  lineNumber: "006",
  packingListNumber: "504236",
  description: "Spring Retainer",
  salesOrderNumber: "602193",
  shipToLines: [
    "Bremskerl",
    "1291 Humbracht Cir",
    "Bartlett, IL 60103",
    "United States"
  ],
  supplierName: "ADAMS Die Cast, Inc",
  supplierLines: [
    "ADAMS Die Cast, Inc",
    "123 Main St",
    "Elk Grove Village, IL 60007",
    "United States"
  ],
  shipDate: "5/22/2026",
  packageIndex: 1,
  packageCount: 2,
  qrValue: "VADAMS Die Cast, Inc^P01-0129^Q546^A51202^S504236^D22-May-26^"
};

describe("generateShippingLabelZPL", () => {
  it("emits ZPL with key fields and barcodes", () => {
    const zpl = generateShippingLabelZPL(sample, label4x6);
    expect(zpl).toMatch(/^\^XA/);
    expect(zpl).toMatch(/\^XZ$/);
    expect(zpl).toContain("^PW812^LL1218");
    expect(zpl).toContain("^PQ1");
    expect(zpl).toContain("^PO R");
    expect(zpl).toContain("^MNY");
    expect(zpl).toContain("^BCN");
    expect(zpl).toContain("^BQN");
    expect(zpl).toContain("01-0129");
    expect(zpl).toContain("546EA");
    expect(zpl).toContain("51202");
    expect(zpl).toContain("504236");
    expect(zpl).toContain("Spring Retainer");
    expect(zpl).toContain("602193");
    expect(zpl).toContain("Bremskerl");
    expect(zpl).toContain("ADAMS Die Cast, Inc");
    expect(zpl).toContain("Rev: 4");
    expect(zpl).toContain("123 Main St");
    expect(zpl).toContain("_5EP01-0129");
    expect(zpl).toContain("_5ES504236");
    expect(zpl).not.toMatch(/BCN,-/);
    expect(zpl).not.toMatch(/\^BY[^\\n]*,-/);
  });
});
