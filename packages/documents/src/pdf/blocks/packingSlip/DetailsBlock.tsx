import { formatDate } from "@carbon/utils";
import { Image, Text, View } from "@react-pdf/renderer";
import { generateBarcode } from "../../../qr/barcode";
import {
  DEFAULT_DETAILS_OPTIONS,
  type DetailsBlock as DetailsBlockType
} from "../../../template";
import { tw } from "../tw";
import type { PackingSlipData } from "./types";
import { PACKING_SLIP_CODE128 } from "./utils";

const labelStyle = tw("text-[8px] font-bold text-gray-600 uppercase");
const valueStyle = tw("text-[10px] text-gray-800 mt-0.5");

/** Pack list metadata: date, ship via, and tracking. */
export function DetailsBlock({
  block,
  data
}: {
  block: DetailsBlockType;
  data: PackingSlipData;
}) {
  const {
    shipment,
    shippingMethod,
    paymentTerm,
    sourceDocument,
    sourceDocumentId,
    customerReference,
    locale
  } = data;
  const opts = { ...DEFAULT_DETAILS_OPTIONS, ...block.options };

  const trackingNumber = shipment?.trackingNumber?.trim();
  const trackingBarcode = trackingNumber
    ? generateBarcode(trackingNumber, "code128", PACKING_SLIP_CODE128.header)
    : null;

  const showSourceDocument =
    opts.showSourceDocument && sourceDocument && sourceDocumentId;
  const showCustomerPo = opts.showCustomerPo && customerReference;

  return (
    <View style={tw("border border-gray-200 mb-4")}>
      <View style={tw("flex flex-row")}>
        <View style={tw("w-1/3 p-3 border-r border-gray-200")}>
          <Text style={labelStyle}>Date</Text>
          {shipment?.postingDate && (
            <Text style={valueStyle}>
              {formatDate(shipment.postingDate, undefined, locale)}
            </Text>
          )}
        </View>

        <View style={tw("w-1/3 p-3 border-r border-gray-200")}>
          <Text style={labelStyle}>Ship Via</Text>
          {shippingMethod?.name && (
            <Text style={valueStyle}>{shippingMethod.name}</Text>
          )}
          {paymentTerm?.name && (
            <Text style={tw("text-[8px] text-gray-500 mt-1")}>
              Terms: {paymentTerm.name}
            </Text>
          )}
        </View>

        <View style={tw("w-1/3 p-3")}>
          <Text style={labelStyle}>Tracking</Text>
          {trackingNumber ? (
            <>
              <Text style={valueStyle}>{trackingNumber}</Text>
              {trackingBarcode && (
                <View style={tw("mt-1 w-full items-start")}>
                  <Image
                    src={trackingBarcode}
                    style={{ height: 14, objectFit: "contain" }}
                  />
                </View>
              )}
            </>
          ) : (
            <Text style={tw("text-[10px] text-gray-400 mt-0.5")}>—</Text>
          )}
        </View>
      </View>

      {(showSourceDocument || showCustomerPo) && (
        <View
          style={tw(
            "flex flex-row border-t border-gray-200 px-3 py-2 text-[9px] text-gray-700"
          )}
        >
          {showSourceDocument && (
            <Text>
              {sourceDocument}: {sourceDocumentId}
            </Text>
          )}
          {showCustomerPo && (
            <Text style={tw(showSourceDocument ? "ml-4" : "")}>
              Customer PO: {customerReference}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
