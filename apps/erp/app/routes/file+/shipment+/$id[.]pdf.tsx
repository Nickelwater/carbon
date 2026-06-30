import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import type { Database } from "@carbon/database";
import { ensureFont, PackingSlipPDF } from "@carbon/documents/pdf";
import {
  collectSectionIds,
  resolveTemplate,
  templateShowsThumbnails,
  toDocumentTemplate
} from "@carbon/documents/template";
import type { JSONContent } from "@carbon/react";
import { getPreferenceHeaders } from "@carbon/utils";
import { renderToStream } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoaderFunctionArgs } from "react-router";
import { getPaymentTerm } from "~/modules/accounting";
import {
  getShipment,
  getShipmentLinesWithDetails,
  getShipmentTracking,
  getShippingMethod,
  getWarehouseTransfer
} from "~/modules/inventory";
import {
  getPurchaseOrder,
  getPurchaseOrderDelivery,
  getSupplierLocation
} from "~/modules/purchasing";
import {
  getCustomerLocation,
  getCustomerLocations,
  getSalesOrder,
  getSalesOrderShipment,
  getSalesTerms
} from "~/modules/sales";
import {
  getCompany,
  getDocumentTemplate,
  resolveSections
} from "~/modules/settings";
import { getBase64ImageFromSupabase } from "~/modules/shared";

type ShipmentLineRow = Database["public"]["Views"]["shipmentLines"]["Row"];

async function resolveShipmentLineCustomerParts(
  client: SupabaseClient<Database>,
  companyId: string,
  customerId: string | null | undefined,
  shipmentLines: ShipmentLineRow[]
): Promise<Record<string, { partNumber: string; revision: string }>> {
  if (!customerId) return {};

  const itemIds = [
    ...new Set(
      shipmentLines.map((line) => line.itemId).filter(Boolean) as string[]
    )
  ];
  if (itemIds.length === 0) return {};

  const { data, error } = await client
    .from("customerPartToItem")
    .select("itemId, customerPartId, customerPartRevision")
    .eq("customerId", customerId)
    .eq("companyId", companyId)
    .in("itemId", itemIds);

  if (error || !data) return {};

  const customerPartByItemId = new Map(
    data.map((row) => [
      row.itemId,
      {
        partNumber: row.customerPartId,
        revision: row.customerPartRevision?.trim() ?? ""
      }
    ])
  );

  const lineCustomerParts: Record<
    string,
    { partNumber: string; revision: string }
  > = {};
  for (const line of shipmentLines) {
    if (!line.id || !line.itemId) continue;
    const customerPart = customerPartByItemId.get(line.itemId);
    if (customerPart) {
      lineCustomerParts[line.id] = customerPart;
    }
  }

  return lineCustomerParts;
}

async function resolveShipmentCustomerReferences(
  client: SupabaseClient<Database>,
  shipmentLines: ShipmentLineRow[]
): Promise<{
  headerCustomerReference?: string;
  lineCustomerReferences: Record<string, string>;
  linePurchaseOrderLines: Record<string, string>;
}> {
  const salesOrderLineIds = [
    ...new Set(
      shipmentLines.map((line) => line.lineId).filter(Boolean) as string[]
    )
  ];

  if (salesOrderLineIds.length === 0) {
    return { lineCustomerReferences: {}, linePurchaseOrderLines: {} };
  }

  const { data, error } = await client
    .from("salesOrderLine")
    .select("id, lineNumber, salesOrder:salesOrderId(customerReference)")
    .in("id", salesOrderLineIds);

  if (error || !data) {
    return { lineCustomerReferences: {}, linePurchaseOrderLines: {} };
  }

  const referenceBySalesOrderLineId = new Map(
    data.map((row) => [row.id, row.salesOrder?.customerReference?.trim() ?? ""])
  );
  const lineNumberBySalesOrderLineId = new Map(
    data.map((row) => [row.id, row.lineNumber])
  );

  const lineCustomerReferences: Record<string, string> = {};
  const linePurchaseOrderLines: Record<string, string> = {};
  for (const line of shipmentLines) {
    if (!line.id || !line.lineId) continue;
    const reference = referenceBySalesOrderLineId.get(line.lineId);
    if (reference) {
      lineCustomerReferences[line.id] = reference;
      const lineNumber = lineNumberBySalesOrderLineId.get(line.lineId);
      linePurchaseOrderLines[line.id] =
        lineNumber != null
          ? `${reference} / ${String(lineNumber).padStart(3, "0")}`
          : reference;
    }
  }

  const uniqueReferences = [
    ...new Set(Object.values(lineCustomerReferences).filter(Boolean))
  ];

  return {
    headerCustomerReference:
      uniqueReferences.length > 1
        ? "Multiple"
        : uniqueReferences.length === 1
          ? uniqueReferences[0]
          : undefined,
    lineCustomerReferences,
    linePurchaseOrderLines
  };
}

async function loadThumbnails(
  showThumbnails: boolean,
  shipmentLines: { id?: string | null; thumbnailPath?: string | null }[],
  fetchImage: (path: string) => Promise<string | null>
) {
  if (!showThumbnails) return {};

  const thumbnailPaths = shipmentLines.reduce<Record<string, string | null>>(
    (acc, line) => {
      if (line.thumbnailPath && line.id) {
        acc[line.id] = line.thumbnailPath;
      }
      return acc;
    },
    {}
  );

  const results = await Promise.all(
    Object.entries(thumbnailPaths).map(async ([id, path]) => {
      if (!path) return null;
      const data = await fetchImage(path);
      return data ? { id, data } : null;
    })
  );

  return results.reduce<Record<string, string | null>>((acc, thumbnail) => {
    if (thumbnail) acc[thumbnail.id] = thumbnail.data;
    return acc;
  }, {});
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "inventory"
  });

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const [company, shipment, shipmentLines] = await Promise.all([
    getCompany(client, companyId),
    getShipment(client, id),
    getShipmentLinesWithDetails(client, id)
  ]);

  if (company.error) {
    console.error(company.error);
  }

  if (shipment.error) {
    console.error(shipment.error);
  }

  if (shipmentLines.error) {
    console.error(shipmentLines.error);
  }

  const serviceRole = getCarbonServiceRole();
  const terms = await getSalesTerms(serviceRole, companyId);

  if (terms.error) {
    console.error(terms.error);
  }

  if (company.error || shipment.error || shipmentLines.error || terms.error) {
    throw new Error("Failed to load packing slip data");
  }

  const { locale } = getPreferenceHeaders(request);

  const documentTemplate = await getDocumentTemplate(
    client,
    companyId,
    "packingSlip"
  );
  const templateConfig = toDocumentTemplate(
    documentTemplate.data,
    "packingSlip"
  );
  const resolvedTemplate = resolveTemplate("packingSlip", templateConfig);
  const showThumbnails = templateShowsThumbnails(templateConfig, "packingSlip");
  const templateSections = await resolveSections(
    client,
    companyId,
    collectSectionIds(resolvedTemplate)
  );
  await ensureFont(resolvedTemplate.settings.fontFamily);

  const isCustomerOnlyShipment =
    !shipment.data.sourceDocument ||
    !shipment.data.sourceDocumentId ||
    shipment.data.sourceDocumentId.trim() === "";

  if (isCustomerOnlyShipment) {
    const customerId = shipment.data.customerId;
    if (!customerId) {
      throw new Error(
        "Shipment has no source document and no customer; cannot generate packing slip"
      );
    }

    const [
      customer,
      customerLocations,
      paymentTerm,
      shippingMethod,
      shipmentTracking
    ] = await Promise.all([
      serviceRole.from("customer").select("*").eq("id", customerId).single(),
      getCustomerLocations(serviceRole, customerId),
      getPaymentTerm(serviceRole, ""),
      getShippingMethod(serviceRole, shipment.data.shippingMethodId ?? ""),
      getShipmentTracking(serviceRole, shipment.data.id, companyId)
    ]);

    if (customer.error || !customer.data) {
      console.error(customer.error);
      throw new Error("Failed to load customer");
    }

    const firstLocation = customerLocations.data?.[0];
    const thumbnails = await loadThumbnails(
      showThumbnails,
      shipmentLines.data ?? [],
      (path) => getBase64ImageFromSupabase(serviceRole, path)
    );

    const customerReferences = await resolveShipmentCustomerReferences(
      serviceRole,
      shipmentLines.data ?? []
    );
    const lineCustomerParts = await resolveShipmentLineCustomerParts(
      serviceRole,
      companyId,
      customerId,
      shipmentLines.data ?? []
    );

    const stream = await renderToStream(
      <PackingSlipPDF
        company={company.data as any}
        customer={customer.data}
        locale={locale}
        meta={{
          author: "Carbon",
          keywords: "packing slip",
          subject: "Packing Slip"
        }}
        customerReference={customerReferences.headerCustomerReference}
        lineCustomerReferences={customerReferences.lineCustomerReferences}
        linePurchaseOrderLines={customerReferences.linePurchaseOrderLines}
        lineCustomerParts={lineCustomerParts}
        shipment={shipment.data}
        shipmentLines={shipmentLines.data ?? []}
        // @ts-expect-error
        shippingAddress={firstLocation?.address ?? null}
        terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
        paymentTerm={paymentTerm.data ?? { id: "", name: "" }}
        shippingMethod={shippingMethod.data ?? { id: "", name: "" }}
        trackedEntities={shipmentTracking.data ?? []}
        title="Pack List"
        thumbnails={thumbnails}
        template={templateConfig}
        sections={templateSections}
      />
    );

    const body: Buffer = await new Promise((resolve, reject) => {
      const buffers: Uint8Array[] = [];
      stream.on("data", (data) => buffers.push(data));
      stream.on("end", () => resolve(Buffer.concat(buffers)));
      stream.on("error", reject);
    });

    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
    });
    return new Response(new Uint8Array(body), { status: 200, headers });
  }

  switch (shipment.data.sourceDocument) {
    case "Sales Order": {
      const [salesOrder, salesOrderShipment] = await Promise.all([
        getSalesOrder(serviceRole, shipment.data.sourceDocumentId),
        getSalesOrderShipment(serviceRole, shipment.data.sourceDocumentId)
      ]);

      const [
        customer,
        customerLocation,
        paymentTerm,
        shippingMethod,
        shipmentTracking
      ] = await Promise.all([
        serviceRole
          .from("customer")
          .select("*")
          .eq("id", salesOrder.data?.customerId ?? "")
          .single(),
        getCustomerLocation(
          serviceRole,
          salesOrder.data?.customerLocationId ?? ""
        ),
        getPaymentTerm(serviceRole, salesOrder.data?.paymentTermId ?? ""),
        getShippingMethod(
          serviceRole,
          shipment.data.shippingMethodId ??
            salesOrderShipment.data?.shippingMethodId ??
            ""
        ),
        getShipmentTracking(serviceRole, shipment.data.id, companyId)
      ]);

      if (customer.error) {
        console.error(customer.error);
        throw new Error("Failed to load customer");
      }

      const thumbnails = await loadThumbnails(
        showThumbnails,
        shipmentLines.data ?? [],
        (path) => getBase64ImageFromSupabase(serviceRole, path)
      );

      const customerReferences = await resolveShipmentCustomerReferences(
        serviceRole,
        shipmentLines.data ?? []
      );
      const lineCustomerParts = await resolveShipmentLineCustomerParts(
        serviceRole,
        companyId,
        salesOrder.data?.customerId,
        shipmentLines.data ?? []
      );

      const stream = await renderToStream(
        <PackingSlipPDF
          company={company.data as any}
          customer={customer.data}
          locale={locale}
          meta={{
            author: "Carbon",
            keywords: "packing slip",
            subject: "Packing Slip"
          }}
          customerReference={
            customerReferences.headerCustomerReference ??
            salesOrder.data?.customerReference ??
            undefined
          }
          lineCustomerReferences={customerReferences.lineCustomerReferences}
          linePurchaseOrderLines={customerReferences.linePurchaseOrderLines}
          lineCustomerParts={lineCustomerParts}
          sourceDocument="Sales Order"
          sourceDocumentId={salesOrder.data?.salesOrderId ?? undefined}
          shipment={shipment.data}
          shipmentLines={shipmentLines.data ?? []}
          // @ts-expect-error
          shippingAddress={customerLocation.data?.address ?? null}
          terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
          paymentTerm={paymentTerm.data ?? { id: "", name: "" }}
          shippingMethod={shippingMethod.data ?? { id: "", name: "" }}
          trackedEntities={shipmentTracking.data ?? []}
          title="Pack List"
          thumbnails={thumbnails}
          template={templateConfig}
          sections={templateSections}
        />
      );

      const body: Buffer = await new Promise((resolve, reject) => {
        const buffers: Uint8Array[] = [];
        stream.on("data", (data) => {
          buffers.push(data);
        });
        stream.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        stream.on("error", reject);
      });

      const headers = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
      });
      return new Response(new Uint8Array(body), { status: 200, headers });
    }
    case "Sales Invoice": {
      const salesInvoice = await serviceRole
        .from("salesInvoice")
        .select("*, salesInvoiceShipment(*)")
        .eq("id", shipment.data.sourceDocumentId ?? "")
        .single();

      if (salesInvoice.error) {
        console.error(salesInvoice.error);
        throw new Error("Failed to load sales invoice");
      }

      const [
        customer,
        customerLocation,
        paymentTerm,
        shippingMethod,
        shipmentTracking
      ] = await Promise.all([
        serviceRole
          .from("customer")
          .select("*")
          .eq("id", salesInvoice.data?.customerId ?? "")
          .single(),
        getCustomerLocation(serviceRole, salesInvoice.data?.locationId ?? ""),
        getPaymentTerm(serviceRole, salesInvoice.data?.paymentTermId ?? ""),
        getShippingMethod(
          serviceRole,
          shipment.data.shippingMethodId ??
            salesInvoice.data?.salesInvoiceShipment?.shippingMethodId ??
            ""
        ),
        getShipmentTracking(serviceRole, shipment.data.id, companyId)
      ]);

      if (customer.error) {
        console.error(customer.error);
        throw new Error("Failed to load customer");
      }

      const thumbnails = await loadThumbnails(
        showThumbnails,
        shipmentLines.data ?? [],
        (path) => getBase64ImageFromSupabase(serviceRole, path)
      );

      const lineCustomerParts = await resolveShipmentLineCustomerParts(
        serviceRole,
        companyId,
        salesInvoice.data?.customerId,
        shipmentLines.data ?? []
      );

      const stream = await renderToStream(
        <PackingSlipPDF
          company={company.data as any}
          customer={customer.data}
          locale={locale}
          meta={{
            author: "Carbon",
            keywords: "packing slip",
            subject: "Packing Slip"
          }}
          customerReference={salesInvoice.data?.customerReference ?? undefined}
          lineCustomerParts={lineCustomerParts}
          sourceDocument="Sales Invoice"
          sourceDocumentId={salesInvoice.data?.invoiceId ?? undefined}
          shipment={shipment.data}
          shipmentLines={shipmentLines.data ?? []}
          // @ts-expect-error
          shippingAddress={customerLocation.data?.address ?? null}
          terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
          paymentTerm={paymentTerm.data ?? { id: "", name: "" }}
          shippingMethod={shippingMethod.data ?? { id: "", name: "" }}
          trackedEntities={shipmentTracking.data ?? []}
          title="Pack List"
          thumbnails={thumbnails}
          template={templateConfig}
          sections={templateSections}
        />
      );

      const body: Buffer = await new Promise((resolve, reject) => {
        const buffers: Uint8Array[] = [];
        stream.on("data", (data) => {
          buffers.push(data);
        });
        stream.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        stream.on("error", reject);
      });

      const headers = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
      });
      return new Response(new Uint8Array(body), { status: 200, headers });
    }
    case "Purchase Order": {
      const [purchaseOrder, purchaseOrderDelivery] = await Promise.all([
        getPurchaseOrder(client, shipment.data.sourceDocumentId),
        getPurchaseOrderDelivery(client, shipment.data.sourceDocumentId)
      ]);

      const [
        supplier,
        supplierLocation,
        poPaymentTerm,
        poShippingMethod,
        poShipmentTracking
      ] = await Promise.all([
        client
          .from("supplier")
          .select("*")
          .eq("id", purchaseOrder.data?.supplierId ?? "")
          .single(),
        getSupplierLocation(
          client,
          purchaseOrder.data?.supplierLocationId ?? ""
        ),
        getPaymentTerm(client, purchaseOrder.data?.paymentTermId ?? ""),
        getShippingMethod(
          client,
          purchaseOrderDelivery.data?.shippingMethodId ?? ""
        ),
        getShipmentTracking(client, shipment.data.id, companyId)
      ]);

      if (supplier.error) {
        console.error(supplier.error);
        throw new Error("Failed to load supplier");
      }

      const poThumbnails = await loadThumbnails(
        showThumbnails,
        shipmentLines.data ?? [],
        (path) => getBase64ImageFromSupabase(client, path)
      );

      const poStream = await renderToStream(
        <PackingSlipPDF
          company={company.data as any}
          customer={supplier.data}
          locale={locale}
          meta={{
            author: "Carbon",
            keywords: "packing slip",
            subject: "Packing Slip"
          }}
          customerReference={purchaseOrder.data?.supplierReference ?? undefined}
          sourceDocument="Purchase Order"
          sourceDocumentId={purchaseOrder.data?.purchaseOrderId ?? undefined}
          shipment={shipment.data}
          shipmentLines={shipmentLines.data ?? []}
          // @ts-expect-error
          shippingAddress={supplierLocation.data?.address ?? null}
          terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
          paymentTerm={poPaymentTerm.data ?? { id: "", name: "" }}
          shippingMethod={poShippingMethod.data ?? { id: "", name: "" }}
          trackedEntities={poShipmentTracking.data ?? []}
          title="Pack List"
          thumbnails={poThumbnails}
          template={templateConfig}
          sections={templateSections}
        />
      );

      const poBody: Buffer = await new Promise((resolve, reject) => {
        const buffers: Uint8Array[] = [];
        poStream.on("data", (data) => {
          buffers.push(data);
        });
        poStream.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        poStream.on("error", reject);
      });

      const poHeaders = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
      });
      return new Response(new Uint8Array(poBody), {
        status: 200,
        headers: poHeaders
      });
    }
    case "Outbound Transfer": {
      const warehouseTransfer = await getWarehouseTransfer(
        client,
        shipment.data.sourceDocumentId
      );

      if (warehouseTransfer.error) {
        console.error(warehouseTransfer.error);
        throw new Error("Failed to load warehouse transfer");
      }

      const [shippingMethod, shipmentTracking] = await Promise.all([
        getShippingMethod(client, shipment.data.shippingMethodId ?? ""),
        getShipmentTracking(client, shipment.data.id, companyId)
      ]);

      const toLocation = warehouseTransfer.data.toLocation;
      const shippingAddress = toLocation
        ? {
            addressLine1: toLocation.addressLine1,
            addressLine2: toLocation.addressLine2,
            city: toLocation.city,
            stateProvince: toLocation.stateProvince,
            postalCode: toLocation.postalCode,
            countryCode: toLocation.countryCode
          }
        : null;

      let transferThumbnails: Record<string, string | null> = {};

      if (showThumbnails) {
        const transferThumbnailPaths = shipmentLines.data?.reduce<
          Record<string, string | null>
        >((acc, line) => {
          if (line.thumbnailPath) {
            acc[line.id!] = line.thumbnailPath;
          }
          return acc;
        }, {});

        transferThumbnails =
          (transferThumbnailPaths
            ? await Promise.all(
                Object.entries(transferThumbnailPaths).map(([id, path]) => {
                  if (!path) {
                    return null;
                  }
                  return getBase64ImageFromSupabase(client, path).then(
                    (data) => ({
                      id,
                      data
                    })
                  );
                })
              )
            : []
          )?.reduce<Record<string, string | null>>((acc, thumbnail) => {
            if (thumbnail) {
              acc[thumbnail.id] = thumbnail.data;
            }
            return acc;
          }, {}) ?? {};
      }

      const transferStream = await renderToStream(
        <PackingSlipPDF
          company={company.data as any}
          customer={{ name: toLocation?.name ?? "" } as any}
          locale={locale}
          meta={{
            author: "Carbon",
            keywords: "packing slip",
            subject: "Packing Slip"
          }}
          sourceDocument="Outbound Transfer"
          sourceDocumentId={warehouseTransfer.data.transferId ?? undefined}
          shipment={shipment.data}
          shipmentLines={shipmentLines.data ?? []}
          // @ts-expect-error
          shippingAddress={shippingAddress}
          terms={(terms?.data?.salesTerms ?? {}) as JSONContent}
          paymentTerm={{ id: "", name: "" }}
          shippingMethod={shippingMethod.data ?? { id: "", name: "" }}
          trackedEntities={shipmentTracking.data ?? []}
          title="Packing Slip"
          thumbnails={transferThumbnails}
          template={templateConfig}
          sections={templateSections}
        />
      );

      const transferBody: Buffer = await new Promise((resolve, reject) => {
        const buffers: Uint8Array[] = [];
        transferStream.on("data", (data) => {
          buffers.push(data);
        });
        transferStream.on("end", () => {
          resolve(Buffer.concat(buffers));
        });
        transferStream.on("error", reject);
      });

      const transferHeaders = new Headers({
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${company.data.name} - ${shipment.data.shipmentId}.pdf"`
      });
      return new Response(new Uint8Array(transferBody), {
        status: 200,
        headers: transferHeaders
      });
    }
    default:
      throw new Error("Invalid source document");
  }
}
