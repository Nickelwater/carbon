import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { LoaderFunctionArgs } from "react-router";
import { data, redirect, useLoaderData } from "react-router";
import invariant from "tiny-invariant";
import { inspectionRouteFamily } from "~/modules/quality/inspectionRoutes";
import type {
  InboundInspectionRow,
  InboundInspectionSample,
  InspectionTrackedEntity,
  IssueTypeListItem
} from "~/modules/quality/types";
import InboundInspectionLotView from "~/modules/quality/ui/InboundInspections/InboundInspectionLotView";
import { loadInspectionLotDetail } from "~/modules/quality/ui/Inspections/loadInspectionLotDetail.server";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    view: "quality",
    role: "employee"
  });
  const { id } = params;
  invariant(id, "id is required");

  const result = await loadInspectionLotDetail(client, {
    id,
    companyId,
    userId
  });

  if (result.error || !result.data) {
    throw redirect(
      path.to.lotInspections,
      await flash(request, error(result.error, "Failed to load lot inspection"))
    );
  }

  const url = new URL(request.url);
  if (result.data.sourceType !== "Job") {
    throw redirect(`${path.to.inboundInspection(id)}${url.search}`);
  }

  return data(result.data);
}

export default function LotInspectionRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const routes = inspectionRouteFamily("Job");

  return (
    <InboundInspectionLotView
      inspection={loaderData.inspection as InboundInspectionRow}
      inspectionDocumentId={loaderData.inspectionDocumentId}
      inspectionPlan={loaderData.inspectionPlan}
      linkedDocument={loaderData.linkedDocument}
      sampleMeasurements={loaderData.sampleMeasurements}
      receiptReadableId={loaderData.receiptReadableId}
      jobReadableId={loaderData.jobReadableId}
      receiverId={loaderData.receiverId}
      itemName={loaderData.itemName}
      itemTrackingType={loaderData.itemTrackingType}
      supplierName={loaderData.supplierName}
      samples={loaderData.samples as InboundInspectionSample[]}
      lotEntities={loaderData.lotEntities as InspectionTrackedEntity[]}
      issueTypes={loaderData.issueTypes as IssueTypeListItem[]}
      currentUserId={loaderData.currentUserId}
      enforceFourEyes={loaderData.enforceFourEyes}
      detailPath={routes.detail}
      dependencies={loaderData.dependencies}
    />
  );
}
