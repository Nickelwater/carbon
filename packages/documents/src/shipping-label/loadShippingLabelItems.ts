import type { Database } from "@carbon/database";
import {
  getShippingLabelPackageCount,
  isSinglePackageShippingLabelRequest,
  splitQuantityIntoBoxes
} from "@carbon/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { buildPackListLineQrPayload } from "../qr/pack-list-qr";
import type { ShippingLabelItem } from "../zpl/shippingLabelTypes";

type ShipmentRow = Database["public"]["Tables"]["shipment"]["Row"];

export type LoadShippingLabelItemsOptions = {
  lineId?: string;
  packageIndex?: number;
  packageCount?: number;
};

function formatLineNumber(lineNumber: number | null | undefined) {
  if (lineNumber == null) return "";
  return String(lineNumber).padStart(3, "0");
}

function formatCompanyLines(
  company: Pick<
    Database["public"]["Tables"]["company"]["Row"],
    | "name"
    | "addressLine1"
    | "addressLine2"
    | "city"
    | "stateProvince"
    | "postalCode"
    | "countryCode"
  >
): string[] {
  const name = company.name?.trim();
  const addressLines = formatAddressLines({
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2,
    city: company.city,
    stateProvince: company.stateProvince,
    postalCode: company.postalCode,
    countryCode: company.countryCode,
    companyId: "",
    fax: null,
    id: "",
    phone: null
  });

  if (name) {
    return addressLines.length > 0 ? [name, ...addressLines] : [name];
  }

  return addressLines.length > 0 ? addressLines : ["—"];
}

function formatQuantityBarcode(quantity: number | null | undefined) {
  const qty = quantity ?? 0;
  return Number.isInteger(qty) ? String(qty) : String(qty);
}

function formatQuantity(
  quantity: number | null | undefined,
  unitOfMeasure: string | null | undefined
) {
  const qty = quantity ?? 0;
  const uom = unitOfMeasure?.trim() || "EA";
  return `${qty}${uom}`;
}

function formatAddressLines(
  address:
    | (Database["public"]["Tables"]["address"]["Row"] & {
        country?: { name: string | null } | null;
      })
    | null
    | undefined
) {
  if (!address) return [];
  const countryValue =
    address.country?.name?.trim() || address.countryCode?.trim() || "";
  const lines = [
    address.addressLine1,
    address.addressLine2,
    [address.city, address.stateProvince, address.postalCode]
      .filter(Boolean)
      .join(", "),
    countryValue
  ].filter((line): line is string => Boolean(line?.trim()));
  return lines;
}

function formatShipToLines(
  customerName: string | null | undefined,
  location: CustomerLocationWithAddress | null | undefined
): string[] {
  const name = customerName?.trim() || location?.name?.trim();
  const addressLines = formatAddressLines(location?.address ?? null);

  if (name) {
    return addressLines.length > 0 ? [name, ...addressLines] : [name];
  }

  return addressLines.length > 0 ? addressLines : ["—"];
}

async function loadCustomerLocation(
  client: SupabaseClient<Database>,
  customerLocationId: string
) {
  const { data } = await client
    .from("customerLocation")
    .select(
      "name, address(id, addressLine1, addressLine2, city, stateProvince, postalCode, countryCode, country(alpha2, name))"
    )
    .eq("id", customerLocationId)
    .maybeSingle();

  return data as CustomerLocationWithAddress | null;
}

async function resolveShipToLines(
  client: SupabaseClient<Database>,
  shipment: ShipmentRow
): Promise<string[]> {
  if (shipment.sourceDocument === "Sales Order" && shipment.sourceDocumentId) {
    const { data: salesOrder } = await client
      .from("salesOrder")
      .select("customerId, customerLocationId")
      .eq("id", shipment.sourceDocumentId)
      .maybeSingle();

    if (salesOrder?.customerLocationId) {
      const [customer, location] = await Promise.all([
        salesOrder.customerId
          ? client
              .from("customer")
              .select("name")
              .eq("id", salesOrder.customerId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        loadCustomerLocation(client, salesOrder.customerLocationId)
      ]);

      if (location) {
        return formatShipToLines(customer.data?.name, location);
      }
    }

    if (salesOrder?.customerId) {
      const [{ data: customer }, { data: locations }] = await Promise.all([
        client
          .from("customer")
          .select("name")
          .eq("id", salesOrder.customerId)
          .maybeSingle(),
        client
          .from("customerLocation")
          .select(
            "name, address(id, addressLine1, addressLine2, city, stateProvince, postalCode, countryCode, country(alpha2, name))"
          )
          .eq("customerId", salesOrder.customerId)
          .order("name", { ascending: true })
          .limit(1)
      ]);

      const firstLocation = locations?.[0] as
        | CustomerLocationWithAddress
        | undefined;
      if (firstLocation) {
        return formatShipToLines(customer?.name, firstLocation);
      }
      if (customer?.name?.trim()) {
        return [customer.name];
      }
    }
  }

  const customerId = shipment.customerId;
  if (!customerId) {
    return ["—"];
  }

  const [{ data: customer }, { data: locations }] = await Promise.all([
    client.from("customer").select("name").eq("id", customerId).maybeSingle(),
    client
      .from("customerLocation")
      .select(
        "name, address(id, addressLine1, addressLine2, city, stateProvince, postalCode, countryCode, country(alpha2, name))"
      )
      .eq("customerId", customerId)
      .order("name", { ascending: true })
      .limit(1)
  ]);

  const firstLocation = locations?.[0] as
    | CustomerLocationWithAddress
    | undefined;
  if (firstLocation) {
    return formatShipToLines(customer?.name, firstLocation);
  }

  return customer?.name?.trim() ? [customer.name] : ["—"];
}

type ShipmentLineRow = Database["public"]["Views"]["shipmentLines"]["Row"];

type CustomerLocationWithAddress = {
  name: string;
  address:
    | (Database["public"]["Tables"]["address"]["Row"] & {
        country?: { name: string | null } | null;
      })
    | null;
};

async function resolveLineCustomerParts(
  client: SupabaseClient<Database>,
  companyId: string,
  customerId: string | null | undefined,
  shipmentLines: ShipmentLineRow[]
) {
  if (!customerId) {
    return new Map<string, { partNumber: string; revision: string }>();
  }

  const itemIds = [
    ...new Set(
      shipmentLines.map((line) => line.itemId).filter(Boolean) as string[]
    )
  ];
  if (itemIds.length === 0) return new Map();

  const { data } = await client
    .from("customerPartToItem")
    .select("itemId, customerPartId, customerPartRevision")
    .eq("customerId", customerId)
    .eq("companyId", companyId)
    .in("itemId", itemIds);

  const byItemId = new Map(
    (data ?? []).map((row) => [
      row.itemId,
      {
        partNumber: row.customerPartId,
        revision: row.customerPartRevision?.trim() ?? ""
      }
    ])
  );

  const byShipmentLineId = new Map<
    string,
    { partNumber: string; revision: string }
  >();
  for (const line of shipmentLines) {
    if (!line.id || !line.itemId) continue;
    const customerPart = byItemId.get(line.itemId);
    if (customerPart) {
      byShipmentLineId.set(line.id, customerPart);
    }
  }
  return byShipmentLineId;
}

async function resolveSalesOrderLineDetails(
  client: SupabaseClient<Database>,
  shipmentLines: ShipmentLineRow[]
) {
  const salesOrderLineIds = [
    ...new Set(
      shipmentLines.map((line) => line.lineId).filter(Boolean) as string[]
    )
  ];
  if (salesOrderLineIds.length === 0) {
    return new Map<
      string,
      {
        purchaseOrder: string;
        lineNumber: string;
        salesOrderNumber: string;
      }
    >();
  }

  const { data: lines } = await client
    .from("salesOrderLine")
    .select("id, sortOrder, salesOrderId")
    .in("id", salesOrderLineIds);

  const salesOrderIds = [
    ...new Set((lines ?? []).map((row) => row.salesOrderId).filter(Boolean))
  ];

  const { data: orders } =
    salesOrderIds.length > 0
      ? await client
          .from("salesOrder")
          .select("id, salesOrderId, customerReference")
          .in("id", salesOrderIds)
      : {
          data: [] as {
            id: string;
            salesOrderId: string;
            customerReference: string | null;
          }[]
        };

  const orderById = new Map((orders ?? []).map((order) => [order.id, order]));

  return new Map(
    (lines ?? []).map((row) => {
      const order = orderById.get(row.salesOrderId);
      return [
        row.id,
        {
          purchaseOrder: order?.customerReference?.trim() ?? "",
          lineNumber: formatLineNumber(row.sortOrder),
          salesOrderNumber: order?.salesOrderId?.trim() ?? ""
        }
      ];
    })
  );
}

async function resolveItemBoxQuantities(
  client: SupabaseClient<Database>,
  itemIds: string[]
) {
  if (itemIds.length === 0) {
    return new Map<string, number>();
  }

  const { data, error } = await client
    .from("itemPackaging")
    .select("itemId, boxQuantity")
    .in("itemId", itemIds);

  if (error) {
    return new Map<string, number>();
  }

  const byItemId = new Map<string, number>();
  for (const row of data ?? []) {
    const boxQuantity = Number(row.boxQuantity ?? 0);
    if (boxQuantity > 0) {
      byItemId.set(row.itemId, boxQuantity);
    }
  }
  return byItemId;
}

type LineLabelContext = {
  partNumber: string;
  revision: string;
  purchaseOrder: string;
  lineNumber: string;
  packingListNumber: string;
  description: string;
  salesOrderNumber: string;
  shipToLines: string[];
  supplierName: string | null;
  supplierLines: string[];
  shipDate: string;
  postingDate: string | null;
  companyName: string;
  unitOfMeasure: string | null | undefined;
};

function buildShippingLabelItem(
  context: LineLabelContext,
  labelQuantity: number,
  packageIndex: number,
  packageCount: number
): ShippingLabelItem {
  const qrValue = buildPackListLineQrPayload({
    companyName: context.companyName,
    partNumber: context.partNumber,
    quantity: labelQuantity,
    customerPo: context.purchaseOrder,
    packListNumber: context.packingListNumber,
    date: context.postingDate
  });

  return {
    partNumber: context.partNumber,
    revision: context.revision,
    quantity: formatQuantity(labelQuantity, context.unitOfMeasure),
    quantityBarcode: formatQuantityBarcode(labelQuantity),
    purchaseOrder: context.purchaseOrder,
    lineNumber: context.lineNumber,
    packingListNumber: context.packingListNumber,
    description: context.description,
    salesOrderNumber: context.salesOrderNumber,
    shipToLines: context.shipToLines,
    supplierName: context.supplierName,
    supplierLines: context.supplierLines,
    shipDate: context.shipDate,
    packageIndex,
    packageCount,
    qrValue
  };
}

function buildLabelsForLine(
  context: LineLabelContext,
  shippedQuantity: number,
  boxQuantity: number | undefined,
  options: LoadShippingLabelItemsOptions
): ShippingLabelItem[] {
  const hasExplicitPackage = isSinglePackageShippingLabelRequest(
    options.packageIndex,
    options.packageCount
  );

  if (!boxQuantity || boxQuantity <= 0) {
    const packageIndex = options.packageIndex ?? 1;
    const packageCount = options.packageCount ?? 1;
    return [
      buildShippingLabelItem(
        context,
        shippedQuantity,
        packageIndex,
        packageCount
      )
    ];
  }

  const boxQuantities = splitQuantityIntoBoxes(shippedQuantity, boxQuantity);
  const totalPackages = boxQuantities.length;

  if (totalPackages === 0) {
    return [];
  }

  if (hasExplicitPackage) {
    const packageIndex = options.packageIndex!;
    const labelQuantity = boxQuantities[packageIndex - 1];
    if (labelQuantity === undefined) {
      return [];
    }

    return [
      buildShippingLabelItem(
        context,
        labelQuantity,
        packageIndex,
        totalPackages
      )
    ];
  }

  return boxQuantities.map((labelQuantity, index) =>
    buildShippingLabelItem(context, labelQuantity, index + 1, totalPackages)
  );
}

export async function loadShippingLabelItems(
  client: SupabaseClient<Database>,
  companyId: string,
  shipmentId: string,
  options: LoadShippingLabelItemsOptions = {}
): Promise<ShippingLabelItem[]> {
  const [company, shipment, shipmentLines] = await Promise.all([
    client
      .from("company")
      .select(
        "name, addressLine1, addressLine2, city, stateProvince, postalCode, countryCode"
      )
      .eq("id", companyId)
      .single(),
    client.from("shipment").select("*").eq("id", shipmentId).single(),
    client.from("shipmentLines").select("*").eq("shipmentId", shipmentId)
  ]);

  if (company.error || !company.data) {
    throw new Error("Failed to load company");
  }
  if (shipment.error || !shipment.data) {
    throw new Error("Failed to load shipment");
  }
  if (shipmentLines.error) {
    throw new Error("Failed to load shipment lines");
  }

  let lines = (shipmentLines.data ?? []).filter(
    (line) => (line.shippedQuantity ?? 0) > 0 && line.itemId
  );

  if (options.lineId) {
    lines = lines.filter((line) => line.id === options.lineId);
  }

  if (lines.length === 0) {
    return [];
  }

  const itemIds = [
    ...new Set(lines.map((line) => line.itemId).filter(Boolean) as string[])
  ];

  const customerId = shipment.data.customerId;
  const [
    shipToLines,
    customerParts,
    salesOrderLineDetails,
    boxQuantitiesByItemId
  ] = await Promise.all([
    resolveShipToLines(client, shipment.data),
    resolveLineCustomerParts(client, companyId, customerId, lines),
    resolveSalesOrderLineDetails(client, lines),
    resolveItemBoxQuantities(client, itemIds)
  ]);

  let salesOrderNumber = shipment.data.sourceDocumentReadableId?.trim() ?? "";
  if (
    shipment.data.sourceDocument === "Sales Order" &&
    shipment.data.sourceDocumentId
  ) {
    const salesOrder = await client
      .from("salesOrder")
      .select("salesOrderId")
      .eq("id", shipment.data.sourceDocumentId)
      .single();
    if (salesOrder.data?.salesOrderId) {
      salesOrderNumber = salesOrder.data.salesOrderId;
    }
  }

  const shipDate = format(
    shipment.data.postingDate
      ? new Date(`${shipment.data.postingDate}T00:00:00`)
      : new Date(),
    "M/d/yyyy"
  );

  const supplierLines = formatCompanyLines(company.data);

  return lines.flatMap((line) => {
    const customerPart = line.id ? customerParts.get(line.id) : undefined;
    const salesOrderLine = line.lineId
      ? salesOrderLineDetails.get(line.lineId)
      : undefined;
    const partNumber =
      customerPart?.partNumber ??
      line.itemReadableId?.trim() ??
      line.itemId ??
      "";
    const revision = customerPart?.revision ?? "";
    const purchaseOrder = salesOrderLine?.purchaseOrder ?? "";
    const lineNumber = salesOrderLine?.lineNumber ?? "";
    const packingListNumber = shipment.data.shipmentId;
    const description = line.description?.trim() ?? "";
    const soNumber = salesOrderLine?.salesOrderNumber || salesOrderNumber;
    const shippedQuantity = Number(line.shippedQuantity ?? 0);
    const boxQuantity = line.itemId
      ? boxQuantitiesByItemId.get(line.itemId)
      : undefined;

    const context: LineLabelContext = {
      partNumber,
      revision,
      purchaseOrder,
      lineNumber,
      packingListNumber,
      description,
      salesOrderNumber: soNumber,
      shipToLines,
      supplierName: company.data.name,
      supplierLines,
      shipDate,
      postingDate: shipment.data.postingDate,
      companyName: company.data.name ?? "",
      unitOfMeasure: line.unitOfMeasure
    };

    return buildLabelsForLine(context, shippedQuantity, boxQuantity, options);
  });
}

export { getShippingLabelPackageCount, splitQuantityIntoBoxes };
