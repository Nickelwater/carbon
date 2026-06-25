import type { requirePermissions } from "../lib/supabase.ts";

type ShipmentClient = Awaited<ReturnType<typeof requirePermissions>>;

const UNPOSTED_SHIPMENT_STATUSES = new Set(["Draft", "Pending"]);

export function shipmentLineRequiresInventoryCheck(
  itemTrackingType: string | null | undefined,
  fulfillmentType?: string | null
): boolean {
  if (itemTrackingType === "Non-Inventory") return false;
  if (fulfillmentType === "Job") return false;
  return true;
}

export async function getItemQuantityOnHandAtLocation(
  client: ShipmentClient,
  itemId: string,
  companyId: string,
  locationId: string
) {
  const { data } = await client
    .rpc("get_inventory_quantities", {
      location_id: locationId,
      company_id: companyId,
    })
    .eq("id", itemId)
    .maybeSingle();

  return Number(data?.quantityOnHand ?? 0);
}

async function getUnpostedShipmentIds(
  client: ShipmentClient,
  shipmentIds: string[]
) {
  if (shipmentIds.length === 0) {
    return new Set<string>();
  }

  const { data: shipments } = await client
    .from("shipment")
    .select("id, status")
    .in("id", shipmentIds);

  return new Set(
    (shipments ?? [])
      .filter((shipment) => UNPOSTED_SHIPMENT_STATUSES.has(shipment.status))
      .map((shipment) => shipment.id)
  );
}

export async function getUnpostedCommittedQuantityForSalesOrderLine(
  client: ShipmentClient,
  salesOrderLineId: string,
  excludeShipmentId?: string
) {
  const { data: lines } = await client
    .from("shipmentLine")
    .select("shippedQuantity, shipmentId")
    .eq("lineId", salesOrderLineId);

  if (!lines?.length) return 0;

  const unpostedShipmentIds = await getUnpostedShipmentIds(
    client,
    [...new Set(lines.map((line) => line.shipmentId).filter(Boolean))] as string[]
  );

  return lines.reduce((sum, line) => {
    if (!line.shipmentId || !unpostedShipmentIds.has(line.shipmentId)) {
      return sum;
    }
    if (excludeShipmentId && line.shipmentId === excludeShipmentId) {
      return sum;
    }
    return sum + Number(line.shippedQuantity ?? 0);
  }, 0);
}

export async function getUnpostedCommittedQuantityForItemAtLocation(
  client: ShipmentClient,
  {
    companyId,
    itemId,
    locationId,
    excludeShipmentId,
    excludeShipmentLineId,
  }: {
    companyId: string;
    itemId: string;
    locationId: string;
    excludeShipmentId?: string;
    excludeShipmentLineId?: string;
  }
) {
  const { data: lines } = await client
    .from("shipmentLine")
    .select("id, shippedQuantity, shipmentId, locationId")
    .eq("itemId", itemId)
    .eq("companyId", companyId);

  if (!lines?.length) return 0;

  const shipmentIds = [
    ...new Set(lines.map((line) => line.shipmentId).filter(Boolean)),
  ] as string[];

  const { data: shipments } = await client
    .from("shipment")
    .select("id, status, locationId")
    .in("id", shipmentIds);

  const shipmentById = new Map(
    (shipments ?? []).map((shipment) => [shipment.id, shipment])
  );

  return lines.reduce((sum, line) => {
    if (!line.shipmentId) return sum;

    const shipment = shipmentById.get(line.shipmentId);
    if (!shipment || !UNPOSTED_SHIPMENT_STATUSES.has(shipment.status)) {
      return sum;
    }

    const lineLocation = line.locationId ?? shipment.locationId;
    if (lineLocation !== locationId) return sum;

    if (excludeShipmentLineId && line.id === excludeShipmentLineId) {
      return sum;
    }
    if (
      excludeShipmentId &&
      line.shipmentId === excludeShipmentId &&
      !excludeShipmentLineId
    ) {
      return sum;
    }

    return sum + Number(line.shippedQuantity ?? 0);
  }, 0);
}

export async function getInitialShippedQuantityForSalesOrderLine(
  client: ShipmentClient,
  {
    companyId,
    shipmentId,
    salesOrderLineId,
    itemId,
    locationId,
    saleQuantity,
    quantitySent,
    itemTrackingType,
    requiresInventoryCheck,
  }: {
    companyId: string;
    shipmentId?: string;
    salesOrderLineId: string;
    itemId: string;
    locationId: string;
    saleQuantity: number;
    quantitySent: number;
    itemTrackingType: string | null | undefined;
    requiresInventoryCheck?: boolean;
  }
) {
  const committedOnOtherShipments =
    await getUnpostedCommittedQuantityForSalesOrderLine(
      client,
      salesOrderLineId,
      shipmentId
    );

  let remainingOrderQuantity = Math.max(
    0,
    saleQuantity - quantitySent - committedOnOtherShipments
  );

  const shouldCheckInventory =
    requiresInventoryCheck ??
    shipmentLineRequiresInventoryCheck(itemTrackingType, null);

  if (!shouldCheckInventory) {
    return remainingOrderQuantity;
  }

  const [onHand, committedInventory] = await Promise.all([
    getItemQuantityOnHandAtLocation(client, itemId, companyId, locationId),
    getUnpostedCommittedQuantityForItemAtLocation(client, {
      companyId,
      itemId,
      locationId,
      excludeShipmentId: shipmentId,
    }),
  ]);

  const availableInventory = Math.max(0, onHand - committedInventory);
  return Math.min(remainingOrderQuantity, availableInventory);
}

export async function validateShipmentCanPost(
  client: ShipmentClient,
  {
    companyId,
    shipment,
    shipmentLines,
    itemsById,
  }: {
    companyId: string;
    shipment: {
      id: string;
      status: string;
      locationId: string | null;
    };
    shipmentLines: Array<{
      id: string;
      itemId: string | null;
      lineId: string | null;
      locationId: string | null;
      shippedQuantity: number | null;
      fulfillment?: { type?: string | null } | null;
    }>;
    itemsById: Map<string, { itemTrackingType: string | null }>;
  }
) {
  if (shipment.status === "Posted") {
    throw new Error("Shipment is already posted");
  }
  if (shipment.status === "Voided") {
    throw new Error("Cannot post a voided shipment");
  }
  if (shipmentLines.length === 0) {
    throw new Error("Shipment has no lines to post");
  }

  const inventoryDemand = new Map<string, number>();

  for (const line of shipmentLines) {
    if (!line.itemId) continue;

    const item = itemsById.get(line.itemId);
    if (
      !shipmentLineRequiresInventoryCheck(
        item?.itemTrackingType,
        line.fulfillment?.type
      )
    ) {
      continue;
    }

    const shippedQuantity = Number(line.shippedQuantity ?? 0);
    if (shippedQuantity <= 0) continue;

    const locationId = line.locationId ?? shipment.locationId;
    if (!locationId) {
      throw new Error("Shipment line is missing a location");
    }

    const key = `${line.itemId}:${locationId}`;
    inventoryDemand.set(key, (inventoryDemand.get(key) ?? 0) + shippedQuantity);
  }

  for (const [key, demandQuantity] of inventoryDemand) {
    const [itemId, locationId] = key.split(":");
    const onHand = await getItemQuantityOnHandAtLocation(
      client,
      itemId,
      companyId,
      locationId
    );

    if (onHand < demandQuantity) {
      throw new Error(
        `Insufficient inventory to post shipment. Required ${demandQuantity} but only ${onHand} on hand.`
      );
    }
  }

  const salesOrderLineIds = shipmentLines
    .map((line) => line.lineId)
    .filter((id): id is string => !!id);

  if (salesOrderLineIds.length === 0) return;

  const { data: salesOrderLines, error } = await client
    .from("salesOrderLine")
    .select("id, saleQuantity, quantitySent")
    .in("id", salesOrderLineIds);

  if (error) {
    throw new Error("Failed to fetch sales order lines");
  }

  const salesOrderLineById = new Map(
    (salesOrderLines ?? []).map((line) => [line.id, line])
  );

  for (const line of shipmentLines) {
    if (!line.lineId) continue;

    const salesOrderLine = salesOrderLineById.get(line.lineId);
    if (!salesOrderLine) continue;

    const shippedQuantity = Number(line.shippedQuantity ?? 0);
    const quantitySent = Number(salesOrderLine.quantitySent ?? 0);
    const saleQuantity = Number(salesOrderLine.saleQuantity ?? 0);

    if (quantitySent + shippedQuantity > saleQuantity) {
      throw new Error(
        "Cannot ship more than the remaining ordered quantity on a sales order line"
      );
    }
  }
}
