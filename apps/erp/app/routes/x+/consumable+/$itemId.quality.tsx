import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, redirect, useLoaderData, useParams } from "react-router";
import invariant from "tiny-invariant";
import { getInspectionDocumentsForItem } from "~/modules/production";
import {
  getInspectionDocumentsForPart,
  getItemInspectionDocumentAssignments,
  getItemInspectionPolicies,
  itemInspectionDocumentAssignmentValidator,
  itemInspectionPolicyValidator,
  upsertItemInspectionDocumentAssignment,
  upsertItemInspectionPolicy
} from "~/modules/quality";
import type { ItemInspectionDocumentAssignment } from "~/modules/quality/types";
import ItemQualityView from "~/modules/quality/ui/Item/ItemQualityView";
import InspectionPolicyForm from "~/modules/quality/ui/SamplingPlan/InspectionPolicyForm";
import { getCompanySettings } from "~/modules/settings";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "parts"
  });
  const { itemId } = params;
  invariant(itemId, "itemId is required");

  const [policies, settings, documentsForPart, documents, assignments] =
    await Promise.all([
      getItemInspectionPolicies(client, itemId, companyId),
      getCompanySettings(client, companyId),
      getInspectionDocumentsForPart(client, companyId, itemId),
      getInspectionDocumentsForItem(client, itemId, companyId),
      getItemInspectionDocumentAssignments(client, itemId, companyId)
    ]);

  return data({
    policies: policies.data ?? [],
    documentsForPart: documentsForPart.data ?? [],
    samplingStandard:
      ((settings.data as any)?.samplingStandard as
        | "ANSI_Z1_4"
        | "ISO_2859_1") ?? "ANSI_Z1_4",
    documents: documents.data ?? [],
    assignments: (assignments.data ?? []) as ItemInspectionDocumentAssignment[]
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

  if (formData.get("intent") === "assignment") {
    const validation = await validator(
      itemInspectionDocumentAssignmentValidator
    ).validate(formData);
    if (validation.error) return validationError(validation.error);

    const result = await upsertItemInspectionDocumentAssignment(client, {
      ...validation.data,
      companyId,
      userId
    });
    if (result.error) {
      throw redirect(
        path.to.consumableQuality(itemId),
        await flash(request, error(result.error, "Failed to save assignment"))
      );
    }

    throw redirect(
      path.to.consumableQuality(itemId),
      await flash(request, success("Inspection plan assignment updated"))
    );
  }

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
  const {
    policies,
    samplingStandard,
    documentsForPart,
    documents,
    assignments
  } = useLoaderData<typeof loader>();
  const { itemId } = useParams();
  if (!itemId) throw new Error("itemId is required");
  return (
    <div className="p-4 w-full flex flex-col gap-4">
      <InspectionPolicyForm
        action={path.to.consumableQuality(itemId)}
        itemId={itemId}
        standard={samplingStandard}
        documentsForPart={documentsForPart}
        policies={policies}
      />
      <ItemQualityView
        itemId={itemId}
        actionPath={path.to.consumableQuality(itemId)}
        documents={documents}
        assignments={assignments}
      />
    </div>
  );
}
