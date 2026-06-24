import { generateBarcode } from "../../../qr/barcode";
import { Header } from "../../components";
import type { PackingSlipData } from "./types";
import { PACKING_SLIP_CODE128 } from "./utils";

export function HeaderBlock({ data }: { data: PackingSlipData }) {
  const packListNumber = data.shipment?.shipmentId;
  const packListBarcode = packListNumber
    ? generateBarcode(packListNumber, "code128", PACKING_SLIP_CODE128.header)
    : null;

  return (
    <Header
      company={data.company}
      title={data.title ?? "Pack List"}
      documentId={packListNumber}
      documentBarcode={packListBarcode}
      date={data.shipment?.postingDate}
      locale={data.locale}
      options={data.headerOptions}
    />
  );
}
