import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  adjustToolLife,
  getToolLifePolicy,
  toolLifeAdjustValidator,
  toolLifePolicyValidator,
  updateToolLifePolicy
} from "~/modules/items";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "parts"
  });

  const { itemId } = params;
  if (!itemId) throw new Error("Could not find itemId");

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "adjust") {
    const validation = await validator(toolLifeAdjustValidator).validate(
      formData
    );
    if (validation.error) return validationError(validation.error);

    const policy = await getToolLifePolicy(client, itemId, companyId);
    if (policy.error || !policy.data) {
      throw redirect(
        path.to.toolDetails(itemId),
        await flash(
          request,
          error(policy.error, "Failed to load tool life policy")
        )
      );
    }

    const result = await adjustToolLife(client, {
      toolReadableId: policy.data.readableId,
      companyId,
      trackedEntityId: validation.data.trackedEntityId,
      newRemaining: validation.data.newRemaining,
      reason: validation.data.reason,
      userId
    });

    if (result.error) {
      throw redirect(
        path.to.toolDetails(itemId),
        await flash(request, error(result.error, "Failed to adjust tool life"))
      );
    }

    throw redirect(
      path.to.toolDetails(itemId),
      await flash(request, success("Tool life adjusted"))
    );
  }

  const validation = await validator(toolLifePolicyValidator).validate(
    formData
  );
  if (validation.error) return validationError(validation.error);

  const rawBasis = validation.data.lifeBasis as string | undefined;
  const lifeBasis =
    rawBasis === "none" || rawBasis == null
      ? null
      : (rawBasis as "Cycles" | "RunTime");

  const result = await updateToolLifePolicy(client, itemId, companyId, userId, {
    lifeBasis,
    lifeLimit: validation.data.lifeLimit ?? null,
    isPermanent: validation.data.isPermanent ?? false,
    dedicatedPartReadableId: validation.data.dedicatedPartReadableId ?? null
  });

  if (result.error) {
    throw redirect(
      path.to.toolDetails(itemId),
      await flash(
        request,
        error(result.error, "Failed to update tool life policy")
      )
    );
  }

  throw redirect(
    path.to.toolDetails(itemId),
    await flash(request, success("Tool life policy updated"))
  );
}
