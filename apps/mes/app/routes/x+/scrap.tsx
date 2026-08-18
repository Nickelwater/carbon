import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { cyclesToParts, normalizePartsPerCycle } from "@carbon/utils";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { scrapQuantityValidator } from "~/services/models";
import { accrueToolLifeForOperation } from "~/services/tool-life.service";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});

  const formData = await request.formData();
  const validation = await validator(scrapQuantityValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const serviceRole = await getCarbonServiceRole();
  const jobOperation = await serviceRole
    .from("jobOperation")
    .select("partsPerCycle, timeBasis")
    .eq("id", validation.data.jobOperationId)
    .maybeSingle();

  const quantityUnit = formData.get("quantityUnit");
  const partsPerCycle = normalizePartsPerCycle(
    jobOperation.data?.partsPerCycle
  );
  const timeBasis = jobOperation.data?.timeBasis ?? "Piece";
  const scrapQuantity =
    quantityUnit === "cycles" || timeBasis === "Cycle"
      ? cyclesToParts(validation.data.quantity, partsPerCycle)
      : validation.data.quantity;

  const {
    trackedEntityId,
    trackingType,
    jobOperationId,
    scrapReasonId,
    notes,
    setupProductionEventId,
    laborProductionEventId,
    machineProductionEventId
  } = validation.data;

  // One transactional edge-function call: Scrap productionQuantity row, BOM
  // backflush, tracked-entity terminal status + replacement serial spawn
  // (serial parents), Done-operation reopen / capacity top-up beyond the
  // planned allowance, and the WIP→scrap journal.
  const issue = await serviceRole.functions.invoke("issue", {
    body: {
      type: "jobOperationScrap",
      jobOperationId,
      quantity: scrapQuantity,
      scrapReasonId,
      notes,
      setupProductionEventId,
      laborProductionEventId,
      machineProductionEventId,
      trackedEntityId: trackingType === "Serial" ? trackedEntityId : undefined,
      companyId,
      userId
    }
  });

  if (issue.error) {
    return data(
      {},
      await flash(
        request,
        error(issue.error, "Failed to record scrap quantity")
      )
    );
  }

  await accrueToolLifeForOperation(
    serviceRole,
    validation.data.jobOperationId,
    scrapQuantity,
    "scrap",
    userId
  );

  // The client (useOperation / AssemblyView) advances to the spawned
  // replacement serial the same way the complete flow does.
  return data(
    { scrapped: true, newTrackedEntityId: issue.data?.newTrackedEntityId },
    await flash(request, success("Scrap quantity recorded successfully"))
  );
}
