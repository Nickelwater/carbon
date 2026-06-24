import { requirePermissions } from "@carbon/auth/auth.server";
import type { ActionFunctionArgs } from "react-router";
import {
  getMaxShippableQuantityForShipmentLine,
  shipmentLineRequiresInventoryCheck
} from "~/modules/inventory";

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "inventory"
  });

  const formData = await request.formData();
  const ids = formData.getAll("ids") as string[];
  const field = formData.get("field");
  const value = formData.get("value");

  if (
    typeof field !== "string" ||
    (typeof value !== "string" && value !== null)
  ) {
    return { error: { message: "Invalid form data" }, data: null };
  }

  if (field !== "storageUnitId" && field !== "shippedQuantity") {
    return { error: { message: `Invalid field: ${field}` }, data: null };
  }

  if (field === "shippedQuantity") {
    const shippedQuantity = Number(value);
    if (!Number.isFinite(shippedQuantity) || shippedQuantity < 0) {
      return {
        error: { message: "Shipped quantity must be a non-negative number" },
        data: null
      };
    }

    const lineId = ids[0];
    if (!lineId) {
      return { error: { message: "Missing shipment line" }, data: null };
    }

    const line = await client
      .from("shipmentLines")
      .select("*, fulfillment(type)")
      .eq("id", lineId)
      .eq("companyId", companyId)
      .single();

    if (line.error || !line.data?.itemId || !line.data.shipmentId) {
      return { error: { message: "Shipment line not found" }, data: null };
    }

    const [shipment, item] = await Promise.all([
      client
        .from("shipment")
        .select("locationId, postedAt")
        .eq("id", line.data.shipmentId)
        .eq("companyId", companyId)
        .single(),
      client
        .from("item")
        .select("itemTrackingType")
        .eq("id", line.data.itemId)
        .single()
    ]);

    if (shipment.error || !shipment.data) {
      return { error: { message: "Shipment not found" }, data: null };
    }

    if (shipment.data.postedAt) {
      return {
        error: { message: "Cannot update a posted shipment" },
        data: null
      };
    }

    const locationId = line.data.locationId ?? shipment.data.locationId;
    if (
      !locationId &&
      shipmentLineRequiresInventoryCheck(
        item.data?.itemTrackingType,
        line.data.fulfillment?.type
      )
    ) {
      return { error: { message: "Shipment has no location" }, data: null };
    }

    if (locationId) {
      const maxShippable = await getMaxShippableQuantityForShipmentLine(
        client,
        {
          companyId,
          shipmentId: line.data.shipmentId,
          lineId,
          itemId: line.data.itemId,
          locationId,
          itemTrackingType: item.data?.itemTrackingType,
          fulfillmentType: line.data.fulfillment?.type,
          outstandingQuantity: line.data.outstandingQuantity ?? 0
        }
      );

      if (shippedQuantity > maxShippable) {
        return {
          error: {
            message: `Shipped quantity cannot exceed available inventory (${maxShippable})`
          },
          data: null
        };
      }
    }
  }

  const update = await client
    .from("shipmentLine")
    .update({
      [field]: value ? value : null,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .in("id", ids)
    .eq("companyId", companyId);

  return update;
}
