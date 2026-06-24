import type { Database } from "@carbon/database";
import type { TrackedEntityAttributes } from "@carbon/utils";
import { Image, Text, View } from "@react-pdf/renderer";
import { generateBarcode } from "../../../qr/barcode";
import { generateQRCode } from "../../../qr/qr-code";
import {
  DEFAULT_LINE_ITEMS_OPTIONS,
  type LineItemsOptions,
  type LineItemsBlock as LineItemsSectionBlock
} from "../../../template";
import { itemTextOverflowStyle } from "../itemText";
import { tw } from "../tw";
import type { PackingSlipData } from "./types";
import {
  buildPackingSlipColumnStyles,
  buildPackListLineQrPayload,
  formatPurchaseOrderLine,
  PACKING_SLIP_CODE128,
  resolvePackingSlipColumnInset,
  resolvePackingSlipPartIdentity
} from "./utils";

type ShipmentLine = Database["public"]["Views"]["shipmentLines"]["Row"];

const headerLabel = tw("text-[8px] font-bold text-gray-600 uppercase");

export function LineItemsBlock({
  block,
  data
}: {
  block: LineItemsSectionBlock;
  data: PackingSlipData;
}) {
  const {
    company,
    shipment,
    customerReference,
    shipmentLines,
    trackedEntities,
    thumbnails,
    lineCustomerReferences,
    linePurchaseOrderLines,
    lineCustomerParts
  } = data;
  const opts: LineItemsOptions = {
    ...DEFAULT_LINE_ITEMS_OPTIONS,
    ...block.options
  };
  const overflow = itemTextOverflowStyle(opts);
  const col = buildPackingSlipColumnStyles(
    resolvePackingSlipColumnInset(opts.packingSlipColumnInset)
  );

  const lines = shipmentLines.filter(
    (line) => (line?.shippedQuantity ?? 0) > 0
  );

  return (
    <View style={tw("mb-4 border border-gray-200")}>
      <View
        style={tw(
          "flex flex-row bg-gray-50 border-b border-gray-200 px-2 py-1"
        )}
      >
        <View style={col.part}>
          <Text style={headerLabel}>Part No:</Text>
        </View>
        <View style={col.desc}>
          <Text style={headerLabel}>Description</Text>
        </View>
        <View style={col.qty}>
          <Text style={headerLabel}>Quantity</Text>
        </View>
        <View style={col.po}>
          <Text style={headerLabel}>Purchase Order/Line:</Text>
        </View>
        <View style={col.qr} />
      </View>

      {lines.map((line: ShipmentLine, index) => {
        const { partNumber: partNo, revision } = resolvePackingSlipPartIdentity(
          line,
          lineCustomerParts
        );
        const purchaseOrderLine =
          (line.id != null ? linePurchaseOrderLines?.[line.id] : undefined) ??
          (line.id != null && lineCustomerReferences?.[line.id]
            ? formatPurchaseOrderLine(lineCustomerReferences[line.id])
            : undefined);

        const partBarcode = partNo
          ? generateBarcode(partNo, "code128", PACKING_SLIP_CODE128.lineItem)
          : null;
        const poBarcode = purchaseOrderLine
          ? generateBarcode(
              purchaseOrderLine,
              "code128",
              PACKING_SLIP_CODE128.lineItemPo
            )
          : null;

        const trackedEntitiesForLine = trackedEntities.filter(
          (entity) =>
            (entity.attributes as TrackedEntityAttributes)?.[
              "Shipment Line"
            ] === line.id
        );
        const customerPo =
          (line.id != null ? lineCustomerReferences?.[line.id] : undefined) ??
          customerReference;
        const lineQrPayload = buildPackListLineQrPayload({
          companyName: company.name ?? "",
          partNumber: partNo,
          quantity: Number(line.shippedQuantity ?? 0),
          customerPo,
          packListNumber: shipment?.shipmentId ?? undefined,
          date: shipment?.postingDate
        });
        const lineQrCode = generateQRCode(lineQrPayload, 8);

        const quantity = Number(line.shippedQuantity ?? 0);
        const qtyBarcode = generateBarcode(
          String(quantity),
          "code128",
          PACKING_SLIP_CODE128.quantity
        );
        const formattedQty = Number.isInteger(quantity)
          ? quantity.toLocaleString("en-US")
          : quantity.toLocaleString("en-US", { maximumFractionDigits: 4 });

        const isLast = index === lines.length - 1;

        return (
          <View
            key={line.id}
            style={tw(
              `flex flex-row px-2 py-2${isLast ? "" : " border-b border-gray-200"}`
            )}
            wrap={false}
          >
            <View style={col.part}>
              <Text style={tw("text-[10px] font-bold text-gray-800")}>
                {partNo}
              </Text>
              {partBarcode && (
                <View style={tw("mt-1 items-start")}>
                  <Image
                    src={partBarcode}
                    style={{ height: 12, objectFit: "contain" }}
                  />
                </View>
              )}
            </View>

            <View style={col.desc}>
              <Text style={{ ...tw("text-[10px] text-gray-800"), ...overflow }}>
                {line.description}
              </Text>
              {revision ? (
                <Text style={tw("text-[9px] text-gray-600 mt-0.5")}>
                  Rev: {revision}
                </Text>
              ) : null}
              {opts.showThumbnails &&
                thumbnails &&
                line.id != null &&
                line.id in thumbnails &&
                thumbnails[line.id] && (
                  <View style={tw("mt-1 w-14")}>
                    <Image
                      src={thumbnails[line.id]!}
                      style={tw("w-full h-auto")}
                    />
                  </View>
                )}
              {trackedEntitiesForLine.length > 0 && (
                <View style={tw("mt-1")}>
                  {trackedEntitiesForLine.map((entity) => (
                    <View
                      key={entity.id}
                      style={tw("flex flex-row items-center gap-1 mb-0.5")}
                    >
                      <Text style={tw("text-[7px] text-gray-600")}>
                        {entity.id}
                      </Text>
                      <Image
                        src={generateQRCode(entity.id, 6)}
                        style={{ width: 18, height: 18 }}
                      />
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={{ ...col.qty, justifyContent: "flex-start" }}>
              <View style={tw("flex flex-row items-baseline")}>
                <Text style={tw("text-[14px] font-bold text-gray-800")}>
                  {formattedQty}
                </Text>
                <Text style={tw("text-[8px] text-gray-500 ml-1 lowercase")}>
                  {line.unitOfMeasure}
                </Text>
              </View>
              <View style={tw("mt-1 items-start")}>
                <Image
                  src={qtyBarcode}
                  style={{ height: 12, objectFit: "contain" }}
                />
              </View>
            </View>

            <View style={col.po}>
              {purchaseOrderLine ? (
                <>
                  <Text style={tw("text-[10px] font-bold text-gray-800")}>
                    {purchaseOrderLine}
                  </Text>
                  {poBarcode && (
                    <View style={tw("mt-1 items-start")}>
                      <Image
                        src={poBarcode}
                        style={{ height: 12, objectFit: "contain" }}
                      />
                    </View>
                  )}
                </>
              ) : (
                <Text style={tw("text-[10px] text-gray-400")}>—</Text>
              )}
            </View>

            <View
              style={{
                ...col.qr,
                alignItems: "flex-end",
                justifyContent: "center"
              }}
            >
              <Image src={lineQrCode} style={{ width: 48, height: 48 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
