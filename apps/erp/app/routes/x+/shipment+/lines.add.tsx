import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { FunctionRegion } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getShipment } from "~/modules/inventory";
import { path } from "~/utils/path";

function parseSalesOrderLineIds(formData: FormData): string[] {
  const batch = formData.get("salesOrderLineIds");
  if (typeof batch === "string" && batch.trim() !== "") {
    const parsed = JSON.parse(batch) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("salesOrderLineIds must be a JSON array");
    }
    return parsed.filter((id): id is string => typeof id === "string" && id);
  }

  const single = formData.get("salesOrderLineId");
  if (typeof single === "string" && single.trim() !== "") {
    return [single];
  }

  return [];
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);

  const formData = await request.formData();
  const shipmentId = formData.get("shipmentId");

  if (typeof shipmentId !== "string") {
    return {
      error: { message: "shipmentId is required" },
      data: null
    };
  }

  let salesOrderLineIds: string[];
  try {
    salesOrderLineIds = parseSalesOrderLineIds(formData);
  } catch {
    throw redirect(
      path.to.shipmentDetails(shipmentId),
      await flash(
        request,
        error(null, "Failed to parse selected sales order lines")
      )
    );
  }

  if (salesOrderLineIds.length === 0) {
    throw redirect(
      path.to.shipmentDetails(shipmentId),
      await flash(request, error(null, "No sales order lines selected"))
    );
  }

  const { companyId, userId } = await requirePermissions(request, {
    create: "inventory"
  });

  const serviceRole = getCarbonServiceRole();
  const shipment = await getShipment(serviceRole, shipmentId);

  if (shipment.error || !shipment.data) {
    throw redirect(
      path.to.shipmentDetails(shipmentId),
      await flash(
        request,
        error(shipment.error ?? "Shipment not found", "Failed to add line")
      )
    );
  }

  if (shipment.data.companyId !== companyId) {
    throw redirect(path.to.shipmentDetails(shipmentId));
  }

  if (shipment.data.postedAt) {
    throw redirect(
      path.to.shipmentDetails(shipmentId),
      await flash(
        request,
        error("Cannot add lines to a posted shipment", "Failed to add line")
      )
    );
  }

  for (const salesOrderLineId of salesOrderLineIds) {
    const result = await serviceRole.functions.invoke<{ id: string }>(
      "create",
      {
        body: {
          type: "shipmentAddLine",
          shipmentId,
          salesOrderLineId,
          companyId,
          userId
        },
        region: FunctionRegion.UsEast1
      }
    );

    if (result.error || !result.data) {
      console.error(result.error);
      throw redirect(
        path.to.shipmentDetails(shipmentId),
        await flash(
          request,
          error(result.error ?? "Edge function failed", "Failed to add line")
        )
      );
    }
  }

  const message =
    salesOrderLineIds.length === 1
      ? "Added shipment line"
      : `Added ${salesOrderLineIds.length} shipment lines`;

  throw redirect(
    path.to.shipmentDetails(shipmentId),
    await flash(request, success(message))
  );
}
