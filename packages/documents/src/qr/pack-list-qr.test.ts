import { describe, expect, it } from "vitest";
import {
  buildPackListLineQrPayload,
  formatPackListQrDate
} from "./pack-list-qr";

describe("formatPackListQrDate", () => {
  it("formats ISO dates as dd-Mon-yy", () => {
    expect(formatPackListQrDate("2026-05-22")).toBe("22-May-26");
  });
});

describe("buildPackListLineQrPayload", () => {
  it("matches the packing slip line QR format", () => {
    expect(
      buildPackListLineQrPayload({
        companyName: "ADAMS Die Cast, Inc",
        partNumber: "01-0129",
        quantity: 546,
        customerPo: "51202",
        packListNumber: "504236",
        date: "2026-05-22"
      })
    ).toBe("VADAMS Die Cast, Inc^P01-0129^Q546^A51202^S504236^D22-May-26^");
  });
});
