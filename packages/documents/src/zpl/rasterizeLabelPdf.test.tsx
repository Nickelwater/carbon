import { labelSizes } from "@carbon/utils";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import ShippingLabelPDF from "../pdf/ShippingLabelPDF";
import { rasterizePdfToShippingLabelZpl } from "./rasterizeLabelPdf";
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
  shipToLines: ["Bremskerl", "1291 Humbracht Cir"],
  supplierName: "ADAMS Die Cast, Inc",
  supplierLines: ["ADAMS Die Cast, Inc", "123 Main St"],
  shipDate: "5/22/2026",
  packageIndex: 1,
  packageCount: 2,
  qrValue: "VADAMS Die Cast, Inc^P01-0129^Q546^A51202^S504236^D22-May-26^"
};

describe("rasterizePdfToShippingLabelZpl", () => {
  it("produces physical-stock ZPL with a graphic field", async () => {
    const pdfBuffer = await renderToBuffer(
      <ShippingLabelPDF items={[sample]} labelSize={label4x6} />
    );
    const zpl = await rasterizePdfToShippingLabelZpl(
      Buffer.from(pdfBuffer),
      label4x6
    );

    expect(zpl).toMatch(/^\^XA/);
    expect(zpl).toMatch(/\^XZ$/);
    expect(zpl).toContain("^PW812^LL1218");
    expect(zpl).toContain("^PQ1");
    expect(zpl).toContain("^GFA,");
    expect(zpl.length).toBeGreaterThan(500);
  }, 30_000);
});
