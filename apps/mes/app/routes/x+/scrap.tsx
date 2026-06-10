import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { cyclesToParts, normalizePartsPerCycle } from "@carbon/utils";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { scrapQuantityValidator } from "~/services/models";
import { insertScrapQuantity } from "~/services/operations.service";
import { accrueToolLifeForOperation } from "~/services/tool-life.service";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {});

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

  // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  const { trackedEntityId, trackingType, ...d } = validation.data;

  const insertScrap = await insertScrapQuantity(client, {
    ...d,
    quantity: scrapQuantity,
    companyId,
    createdBy: userId
  });

  if (insertScrap.error) {
    return data(
      {},
      await flash(
        request,
        error(insertScrap.error, "Failed to record scrap quantity")
      )
    );
  }

  const issue = await serviceRole.functions.invoke("issue", {
    body: {
      id: validation.data.jobOperationId,
      type: "jobOperation",
      quantity: scrapQuantity,
      companyId,
      userId
    }
  });

  if (issue.error) {
    throw data(
      insertScrap.data,
      await flash(request, error(issue.error, "Failed to issue materials"))
    );
  }

  await accrueToolLifeForOperation(
    serviceRole,
    validation.data.jobOperationId,
    scrapQuantity,
    "scrap",
    userId
  );

  return data(
    insertScrap.data,
    await flash(request, success("Scrap quantity recorded successfully"))
  );
}
