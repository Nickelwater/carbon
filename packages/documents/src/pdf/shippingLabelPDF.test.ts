import { labelSizes } from "@carbon/utils";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { ShippingLabelItem } from "../zpl/shippingLabelTypes";
import ShippingLabelPDF from "./ShippingLabelPDF";

const item: ShippingLabelItem = {
  partNumber: "01-0129",
  revision: "4",
  quantity: "546EA",
  quantityBarcode: "546",
  purchaseOrder: "51202",
  lineNumber: "006",
  packingListNumber: "504236",
  description: "Spring Retainer",
  salesOrderNumber: "602193",
  shipToLines: ["Bremskerl"],
  supplierName: "ADAMS Die Cast, Inc",
  supplierLines: ["ADAMS Die Cast, Inc", "123 Main St"],
  shipDate: "5/22/2026",
  packageIndex: 1,
  packageCount: 2,
  qrValue: "test"
};

function mediaBox(pdf: Buffer): number[] {
  const match = pdf.toString("latin1").match(/\/MediaBox \[([^\]]+)\]/);
  if (!match) throw new Error("No MediaBox found");
  return match[1]!.trim().split(/\s+/).map(Number);
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
}

describe("ShippingLabelPDF page sizing", () => {
  it("renders a 6x4 landscape page for label4x6", async () => {
    const labelSize = labelSizes.find((size) => size.id === "label4x6");
    if (!labelSize) throw new Error("Missing label4x6");

    const pdf = await renderToBuffer(
      createElement(ShippingLabelPDF, { items: [item], labelSize }) as never
    );

    expect(mediaBox(pdf)).toEqual([0, 0, 6 * 72, 4 * 72]);
    expect(pageCount(pdf)).toBe(1);
  });
});
