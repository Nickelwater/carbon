import type { LabelSize } from "@carbon/utils";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { ResolvedLabelLogo } from "../labels/labelLogo";
import { generateBarcode } from "../qr/barcode";
import { generateQRCode } from "../qr/qr-code";
import type { ShippingLabelItem } from "../zpl/shippingLabelTypes";

const CODE128 = { scaleX: 1.5, scaleY: 1.5, height: 6, width: 50 };

const border = "1pt solid black";
const addressFontSize = 11;
const supplierFontSize = 9;

function LabelRow({
  height,
  label,
  value,
  barcodeValue,
  secondLabel,
  secondValue,
  showBottomBorder = true
}: {
  height: number;
  label: string;
  value: string;
  barcodeValue?: string;
  secondLabel?: string;
  secondValue?: string;
  showBottomBorder?: boolean;
}) {
  return (
    <View
      style={{
        height,
        borderBottom: showBottomBorder ? border : undefined,
        paddingHorizontal: 4,
        paddingVertical: 2,
        overflow: "hidden"
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 7 }}>{label}:</Text>
        {secondLabel && secondValue ? (
          <Text style={{ fontSize: 7 }}>{secondLabel}:</Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 9, fontWeight: "bold" }}>{value || "—"}</Text>
        {secondLabel && secondValue ? (
          <Text style={{ fontSize: 9, fontWeight: "bold" }}>{secondValue}</Text>
        ) : null}
      </View>
      {barcodeValue?.trim() ? (
        <Image
          style={{
            height: 14,
            width: "100%",
            marginTop: 1,
            objectFit: "contain"
          }}
          src={generateBarcode(barcodeValue, "code128", CODE128)}
        />
      ) : null}
    </View>
  );
}

function ShippingLabelPage({
  item,
  labelSize,
  logo
}: {
  item: ShippingLabelItem;
  labelSize: LabelSize;
  logo?: ResolvedLabelLogo | null;
}) {
  const pageWidth = labelSize.width * 72;
  const pageHeight = labelSize.height * 72;
  const pad = 3;
  const innerW = pageWidth - pad * 2;
  const innerH = pageHeight - pad * 2;

  const headerH = Math.round(innerH * 0.22);
  const bodyH = innerH - headerH;
  const leftW = Math.round(innerW * 0.58);
  const rightW = innerW - leftW;
  const footerH = Math.round(bodyH * 0.34);
  const rightBodyH = bodyH - footerH;
  const rowH = Math.floor(bodyH / 5);
  const shipSectionH = Math.round(rightBodyH * 0.48);
  const qrSize = Math.min(68, footerH - 6);

  return (
    <Page
      wrap={false}
      size={[pageWidth, pageHeight]}
      style={{ padding: pad, fontFamily: "Helvetica", color: "black" }}
    >
      <View style={{ width: innerW, height: innerH, flexDirection: "column" }}>
        <View
          style={{
            height: headerH,
            borderBottom: border,
            position: "relative",
            padding: 4
          }}
        >
          <Text style={{ fontSize: 7 }}>Part No:</Text>
          <View
            style={{
              flex: 1,
              width: "100%",
              alignItems: "center",
              justifyContent: "center",
              paddingBottom: 10,
              paddingHorizontal: 8
            }}
          >
            <Text
              style={{
                fontSize: 18,
                fontFamily: "Helvetica-Bold",
                fontWeight: "bold",
                textAlign: "center",
                width: "100%"
              }}
            >
              {item.partNumber}
            </Text>
            <View style={{ width: "65%", alignItems: "center", marginTop: 2 }}>
              <Image
                style={{
                  height: 18,
                  width: "100%",
                  objectFit: "contain"
                }}
                src={generateBarcode(item.partNumber, "code128", CODE128)}
              />
            </View>
          </View>
          <Text
            style={{ fontSize: 7, position: "absolute", bottom: 4, left: 4 }}
          >
            Rev: {item.revision || "—"}
          </Text>
          {logo?.color || logo?.mono ? (
            <View
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                height: headerH - 12,
                justifyContent: "center",
                alignItems: "flex-end"
              }}
            >
              <Image
                style={{
                  height: headerH - 16,
                  maxWidth: rightW - 8,
                  objectFit: "contain",
                  objectPosition: "right"
                }}
                src={logo.color ?? logo.mono ?? ""}
              />
            </View>
          ) : null}
        </View>

        <View style={{ height: bodyH, flexDirection: "row" }}>
          <View style={{ width: leftW, borderRight: border }}>
            <View
              style={{
                height: rowH,
                borderBottom: border,
                paddingHorizontal: 4,
                paddingVertical: 2,
                overflow: "hidden"
              }}
            >
              <Text style={{ fontSize: 7 }}>Description:</Text>
              <Text style={{ fontSize: 9, fontWeight: "bold" }}>
                {item.description}
              </Text>
            </View>
            <LabelRow
              height={rowH}
              label="QTY"
              value={item.quantity}
              barcodeValue={item.quantityBarcode}
            />
            <LabelRow
              height={rowH}
              label="PO"
              value={item.purchaseOrder}
              barcodeValue={item.purchaseOrder?.trim() || undefined}
              secondLabel={item.lineNumber?.trim() ? "Line" : undefined}
              secondValue={item.lineNumber?.trim() || undefined}
            />
            <LabelRow
              height={rowH}
              label="Packing List"
              value={item.packingListNumber}
              barcodeValue={item.packingListNumber}
            />
            <LabelRow
              height={rowH}
              label="SO"
              value={item.salesOrderNumber}
              barcodeValue={item.salesOrderNumber}
              showBottomBorder={false}
            />
          </View>

          <View style={{ width: rightW, flexDirection: "column" }}>
            <View style={{ height: rightBodyH, flexDirection: "column" }}>
              <View
                style={{
                  height: shipSectionH,
                  padding: 4,
                  paddingBottom: 0,
                  overflow: "hidden"
                }}
              >
                <Text style={{ fontSize: 7 }}>Ship To:</Text>
                {item.shipToLines.map((line) => (
                  <Text
                    key={line}
                    style={{ fontSize: addressFontSize, marginTop: 1 }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
              <View style={{ borderTop: border, width: rightW }} />
              <View
                style={{
                  flex: 1,
                  padding: 4,
                  paddingTop: 4,
                  overflow: "hidden"
                }}
              >
                <Text style={{ fontSize: 7 }}>Supplier:</Text>
                {item.supplierLines.map((line, index) => (
                  <Text
                    key={line}
                    style={{
                      fontSize: supplierFontSize,
                      fontWeight: index === 0 ? "bold" : "normal",
                      marginTop: 1
                    }}
                  >
                    {line}
                  </Text>
                ))}
              </View>
            </View>

            <View
              style={{
                height: footerH,
                borderTop: border,
                flexDirection: "row",
                padding: 4
              }}
            >
              <View style={{ flex: 1, justifyContent: "center" }}>
                <Text style={{ fontSize: 7 }}>Date: {item.shipDate}</Text>
                <Text style={{ fontSize: 9, fontWeight: "bold", marginTop: 3 }}>
                  {item.packageIndex} of {item.packageCount}
                </Text>
              </View>
              <View
                style={{
                  width: qrSize + 4,
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Image
                  style={{ width: qrSize, height: qrSize }}
                  src={generateQRCode(item.qrValue, qrSize / 72)}
                />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Page>
  );
}

export default function ShippingLabelPDF({
  items,
  labelSize,
  logo
}: {
  items: ShippingLabelItem[];
  labelSize: LabelSize;
  logo?: ResolvedLabelLogo | null;
}) {
  return (
    <Document>
      {items.map((item) => (
        <ShippingLabelPage
          key={`${item.partNumber}-p${item.packageIndex}-of-${item.packageCount}-${item.quantityBarcode}`}
          item={item}
          labelSize={labelSize}
          logo={logo}
        />
      ))}
    </Document>
  );
}
