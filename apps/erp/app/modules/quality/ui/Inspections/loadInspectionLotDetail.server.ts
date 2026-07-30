import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getInspectionDocument, getInspectionPlan } from "~/modules/production";
import {
  getInboundInspection,
  getInboundInspectionLotTrackedEntities,
  getInboundInspectionMeasurements,
  getInProcessInspectionDependencies,
  getIssueTypesList
} from "~/modules/quality";
import type {
  InboundInspectionRow,
  InboundInspectionSample,
  InspectionTrackedEntity,
  IssueTypeListItem
} from "~/modules/quality/types";
import { getCompanySettings } from "~/modules/settings";

export async function loadInspectionLotDetail(
  client: SupabaseClient<Database>,
  { id, companyId, userId }: { id: string; companyId: string; userId: string }
) {
  const [inspection, settings, issueTypes] = await Promise.all([
    getInboundInspection(client, id),
    getCompanySettings(client, companyId),
    getIssueTypesList(client, companyId)
  ]);

  if (inspection.error || !inspection.data) {
    return { error: inspection.error ?? new Error("Inspection not found") };
  }

  const insp = inspection.data as InboundInspectionRow & {
    item: {
      readableId: string | null;
      name: string;
      type: string;
      itemTrackingType: string | null;
    } | null;
    receipt: {
      receiptId: string;
      supplierId: string | null;
      createdBy: string;
    } | null;
    job: { jobId: string; updatedBy: string | null } | null;
    supplier: { name: string } | null;
    inboundInspectionSample: InboundInspectionSample[];
  };

  if (insp.companyId !== companyId) {
    return { error: new Error("Inspection not found") };
  }

  const sourceType =
    ((insp as { sourceType?: string }).sourceType as string | undefined) ??
    "Receipt";

  const lotEntities = await getInboundInspectionLotTrackedEntities(
    client,
    insp.id,
    companyId,
    insp.receiptLineId
  );

  const inspectionDocumentId =
    (insp as { inspectionDocumentId?: string | null }).inspectionDocumentId ??
    null;
  const sampleIds = (insp.inboundInspectionSample ?? []).map((s) => s.id);

  const [inspectionPlan, linkedDocument, measurementsResult] =
    await Promise.all([
      inspectionDocumentId
        ? getInspectionPlan(client, inspectionDocumentId)
        : Promise.resolve({ data: null, error: null }),
      inspectionDocumentId
        ? getInspectionDocument(client, inspectionDocumentId, companyId)
        : Promise.resolve({ data: null, error: null }),
      getInboundInspectionMeasurements(client, sampleIds)
    ]);

  const isJobSource = sourceType === "Job";

  const dependencies = isJobSource
    ? await getInProcessInspectionDependencies(client, insp.id, companyId)
    : { data: [] };

  return {
    data: {
      inspection: insp,
      dependencies: dependencies.data ?? [],
      sourceType: sourceType as "Receipt" | "Job",
      inspectionDocumentId,
      inspectionPlan: inspectionPlan.data ?? [],
      linkedDocument: linkedDocument.data,
      sampleMeasurements: measurementsResult.data ?? {},
      receiptReadableId: insp.receipt?.receiptId ?? null,
      jobReadableId: insp.job?.jobId ?? null,
      receiverId: isJobSource
        ? (insp.job?.updatedBy ?? null)
        : (insp.receipt?.createdBy ?? null),
      itemName: insp.item?.name ?? "",
      itemTrackingType: insp.item?.itemTrackingType ?? null,
      supplierName: insp.supplier?.name ?? null,
      samples: insp.inboundInspectionSample ?? [],
      lotEntities: (lotEntities.data ?? []) as InspectionTrackedEntity[],
      issueTypes: (issueTypes.data ?? []) as IssueTypeListItem[],
      enforceFourEyes:
        ((settings.data as any)?.enforceInspectionFourEyes as boolean) ?? false,
      currentUserId: userId
    }
  };
}
