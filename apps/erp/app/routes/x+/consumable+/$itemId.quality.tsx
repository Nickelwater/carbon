import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useLoaderData, useParams } from "react-router";
import invariant from "tiny-invariant";
import {
  getInspectionDocumentsForPart,
  getItemInspectionPolicies,
  itemInspectionPolicyValidator,
  upsertItemInspectionPolicy
} from "~/modules/quality";
import InspectionPolicyForm from "~/modules/quality/ui/SamplingPlan/InspectionPolicyForm";
import { getCompanySettings } from "~/modules/settings";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "parts"
  });
  const { itemId } = params;
  invariant(itemId, "itemId is required");

  const [policies, settings, documents] = await Promise.all([
    getItemInspectionPolicies(client, itemId, companyId),
    getCompanySettings(client, companyId),
    getInspectionDocumentsForPart(client, companyId, itemId)
  ]);

  return data({
    policies: policies.data ?? [],
    documentsForPart: documents.data ?? [],
    samplingStandard:
      ((settings.data as any)?.samplingStandard as
        | "ANSI_Z1_4"
        | "ISO_2859_1") ?? "ANSI_Z1_4"
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "quality"
  });
  const { itemId } = params;
  invariant(itemId, "itemId is required");

  const formData = await request.formData();
  const validation = await validator(itemInspectionPolicyValidator).validate(
    formData
  );
  if (validation.error) return validationError(validation.error);

  const result = await upsertItemInspectionPolicy(client, {
    ...validation.data,
    companyId,
    updatedBy: userId
  });
  if (result.error) {
    throw redirect(
      path.to.consumableQuality(itemId),
      await flash(
        request,
        error(result.error, "Failed to save inspection policy")
      )
    );
  }

  throw redirect(
    path.to.consumableQuality(itemId),
    await flash(request, success("Inspection policy updated"))
  );
}

export default function ConsumableQualityRoute() {
  const { policies, samplingStandard, documentsForPart } =
    useLoaderData<typeof loader>();
  const { itemId } = useParams();
  if (!itemId) throw new Error("itemId is required");
  return (
    <div className="p-4">
      <InspectionPolicyForm
        action={path.to.consumableQuality(itemId)}
        itemId={itemId}
        standard={samplingStandard}
        documentsForPart={documentsForPart}
        policies={policies}
      />
    </div>
  );
}
