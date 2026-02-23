import { assertIsPost, error, getCarbonServiceRole } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { FunctionRegion } from "@supabase/supabase-js";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getShipment } from "~/modules/inventory";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);

  const formData = await request.formData();
  const shipmentId = formData.get("shipmentId");
  const salesOrderLineId = formData.get("salesOrderLineId");

  if (typeof shipmentId !== "string" || typeof salesOrderLineId !== "string") {
    return {
      error: { message: "shipmentId and salesOrderLineId are required" },
      data: null
    };
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

  const result = await serviceRole.functions.invoke<{ id: string }>("create", {
    body: {
      type: "shipmentAddLine",
      shipmentId,
      salesOrderLineId,
      companyId,
      userId
    },
    region: FunctionRegion.UsEast1
  });

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

  return redirect(path.to.shipmentDetails(shipmentId));
}
