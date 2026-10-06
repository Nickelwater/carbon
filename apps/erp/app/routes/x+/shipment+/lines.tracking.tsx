// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import type { Json } from "@carbon/database";
import type { TrackedEntityAttributes } from "@carbon/utils";
import { isSerialShipmentAssignment, round } from "@carbon/utils";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";

function clearShipmentAttrs(attributes: Record<string, unknown>) {
  const cleaned = { ...attributes };
  delete cleaned["Shipment Line"];
  delete cleaned.Shipment;
  delete cleaned["Shipment Line Index"];
  delete cleaned["Shipment Line Batch Index"];
  delete cleaned["Allocated Quantity"];
  return cleaned;
}

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    create: "inventory"
  });

  const formData = await request.formData();

  const shipmentLineId = formData.get("shipmentLineId") as string;
  const shipmentId = formData.get("shipmentId") as string;
  const trackingType = formData.get("trackingType") as "batch" | "serial";
  const serviceRole = getCarbonServiceRole();

  if (trackingType === "batch" && formData.get("clearIndex") !== null) {
    const index = Number(formData.get("clearIndex"));
    if (!Number.isFinite(index)) {
      return data(
        { success: false, error: "Invalid batch index" },
        await flash(request, error("Invalid batch index"))
      );
    }

    const staleResponse = await serviceRole
      .from("trackedEntity")
      .select("id, attributes")
      .eq("companyId", companyId)
      .eq("attributes ->> Shipment Line", shipmentLineId);

    const staleRows =
      staleResponse.data?.filter((stale) => {
        const attributes = stale.attributes as TrackedEntityAttributes;
        if (isSerialShipmentAssignment(attributes)) return false;

        const staleBatchIndex = attributes["Shipment Line Batch Index"];
        return (
          staleBatchIndex === index ||
          (index === 0 && staleBatchIndex === undefined)
        );
      }) ?? [];

    if (staleRows.length > 0) {
      await Promise.all(
        staleRows.map((stale) =>
          serviceRole
            .from("trackedEntity")
            .update({
              attributes: clearShipmentAttrs(
                (stale.attributes ?? {}) as Record<string, unknown>
              ) as Json
            })
            .eq("id", stale.id)
        )
      );
    }

    return { success: true };
  }

  const trackedEntityId = formData.get("trackedEntityId") as string;

  const [trackedEntityResponse, shipmentResponse, shipmentLineResponse] =
    await Promise.all([
      client
        .from("trackedEntity")
        .select("*")
        .eq("id", trackedEntityId)
        .eq("companyId", companyId)
        .single(),
      client
        .from("shipment")
        .select("sourceDocument, sourceDocumentId")
        .eq("id", shipmentId)
        .eq("companyId", companyId)
        .single(),
      client
        .from("shipmentLine")
        .select("itemId")
        .eq("id", shipmentLineId)
        .eq("shipmentId", shipmentId)
        .eq("companyId", companyId)
        .single()
    ]);

  if (trackedEntityResponse.error) {
    return data(
      { success: false, error: trackedEntityResponse.error.message },
      await flash(
        request,
        error(trackedEntityResponse.error, trackedEntityResponse.error.message)
      )
    );
  }

  const trackedEntity = trackedEntityResponse.data;

  if (shipmentResponse.error) {
    return data(
      { success: false, error: shipmentResponse.error.message },
      await flash(
        request,
        error(shipmentResponse.error, "Failed to load shipment")
      )
    );
  }

  if (shipmentLineResponse.error) {
    return data(
      { success: false, error: shipmentLineResponse.error.message },
      await flash(
        request,
        error(shipmentLineResponse.error, "Failed to load shipment line")
      )
    );
  }

  if (
    trackedEntity.itemId &&
    shipmentLineResponse.data.itemId &&
    trackedEntity.itemId !== shipmentLineResponse.data.itemId
  ) {
    const message = "Tracked entity does not match the line's item";
    return data(
      { success: false, error: message },
      await flash(request, error(message))
    );
  }

  const isSalesReturnShipment =
    shipmentResponse.data?.sourceDocument === "Sales Return Order";
  const allowedStatus = isSalesReturnShipment ? "On Hold" : "Available";

  if (isSalesReturnShipment) {
    const entityReceiptId = (
      trackedEntity.attributes as Record<string, unknown> | null
    )?.["Receipt"] as string | undefined;
    const provenance = entityReceiptId
      ? await client
          .from("receipt")
          .select("id")
          .eq("id", entityReceiptId)
          .eq("sourceDocument", "Sales Return Order")
          .eq("sourceDocumentId", shipmentResponse.data.sourceDocumentId ?? "")
          .eq("companyId", companyId)
          .maybeSingle()
      : { data: null, error: null };
    if (provenance.error) {
      return data(
        { success: false, error: "Failed to verify the entity's provenance" },
        await flash(
          request,
          error(provenance.error, "Failed to verify the entity's provenance")
        )
      );
    }
    if (!provenance.data) {
      const message =
        "Tracked entity was not received on this return order and cannot ship back on it";
      return data(
        { success: false, error: message },
        await flash(request, error(message))
      );
    }
  }

  if (trackedEntity.status !== allowedStatus) {
    return data(
      {
        success: false,
        error: `Tracked entity is not available. Current status: ${trackedEntity.status}`
      },
      await flash(
        request,
        error(
          `Tracked entity is not available. Current status: ${trackedEntity.status}`
        )
      )
    );
  }

  const existingAttributes = trackedEntity.attributes || {};
  let newAttributes = { ...(existingAttributes as Record<string, unknown>) };

  if (trackingType === "batch") {
    const quantity = Number(formData.get("quantity"));
    const index = Number(formData.get("index"));

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return data(
        { success: false, error: "Batch quantity must be greater than zero" },
        await flash(request, error("Batch quantity must be greater than zero"))
      );
    }

    if (!Number.isFinite(index) || index < 0) {
      return data(
        { success: false, error: "Invalid batch index" },
        await flash(request, error("Invalid batch index"))
      );
    }

    if (round(trackedEntity.quantity) < round(quantity)) {
      return data(
        { success: false, error: "Batch has insufficient quantity" },
        await flash(request, error("Batch has insufficient quantity"))
      );
    }

    newAttributes = {
      ...newAttributes,
      "Shipment Line": shipmentLineId,
      Shipment: shipmentId,
      "Shipment Line Batch Index": index,
      "Allocated Quantity": quantity
    };
  } else if (trackingType === "serial") {
    const index = Number(formData.get("index"));

    newAttributes = {
      ...newAttributes,
      "Shipment Line": shipmentLineId,
      Shipment: shipmentId,
      "Shipment Line Index": index
    };
  }

  const updateResponse = await serviceRole
    .from("trackedEntity")
    .update({
      attributes: newAttributes as Json
    })
    .eq("id", trackedEntityId)
    .eq("status", allowedStatus)
    .select("id");

  if (updateResponse.error) {
    return data(
      { success: false, error: updateResponse.error.message },
      await flash(
        request,
        error(updateResponse.error, updateResponse.error.message)
      )
    );
  }

  if (!updateResponse.data || updateResponse.data.length === 0) {
    const message = `Tracked entity is no longer ${allowedStatus}`;
    return data(
      { success: false, error: message },
      await flash(request, error(message))
    );
  }

  let staleQuery = serviceRole
    .from("trackedEntity")
    .select("id, attributes")
    .eq("companyId", companyId)
    .eq("attributes ->> Shipment Line", shipmentLineId)
    .neq("id", trackedEntityId);

  const batchIndex =
    trackingType === "batch" ? Number(formData.get("index")) : null;

  if (trackingType === "serial") {
    const index = Number(formData.get("index"));
    staleQuery = staleQuery.eq(
      "attributes ->> Shipment Line Index",
      String(index)
    );
  }

  const staleResponse = await staleQuery;

  const staleRows =
    staleResponse.data?.filter((stale) => {
      if (trackingType !== "batch" || batchIndex === null) return true;

      const attributes = stale.attributes as TrackedEntityAttributes;
      if (isSerialShipmentAssignment(attributes)) return false;

      const staleBatchIndex = attributes["Shipment Line Batch Index"];
      return (
        staleBatchIndex === batchIndex ||
        (batchIndex === 0 && staleBatchIndex === undefined)
      );
    }) ?? [];

  if (staleRows.length > 0) {
    await Promise.all(
      staleRows.map((stale) =>
        serviceRole
          .from("trackedEntity")
          .update({
            attributes: clearShipmentAttrs(
              (stale.attributes ?? {}) as Record<string, unknown>
            ) as Json
          })
          .eq("id", stale.id)
      )
    );
  }

  return { success: true };
}
