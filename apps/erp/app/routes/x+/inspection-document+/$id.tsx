import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { trigger } from "@carbon/jobs";
import { NotificationEvent } from "@carbon/notifications";
import { ClientOnly, Spinner } from "@carbon/react";
import { msg } from "@lingui/core/macro";
import { lazy, Suspense } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getUnitOfMeasuresList } from "~/modules/items/items.service";
import { inspectionDocumentApprovalValidator } from "~/modules/production/production.models";
import type { InspectionDocumentContent } from "~/modules/production/types";
import InspectionDocumentHeader from "~/modules/production/ui/InspectionDocument/InspectionDocumentHeader";
import type { SamplingRule } from "~/modules/production/ui/InspectionDocument/SamplingRuleModal";
import {
  getBalloons,
  getInspectionDocument,
  getInspectionDocumentVersions,
  getInspectionFeatures
} from "~/modules/quality/quality.service";
import { getCompanySettings } from "~/modules/settings";
import {
  approveRequest,
  canApproveRequest,
  canCancelRequest,
  getLatestApprovalRequestForDocument,
  isApprovalRequired,
  rejectRequest
} from "~/modules/shared";
import { getDatabaseClient } from "~/services/database.server";
import type { BreadcrumbSegment, Handle } from "~/utils/handle";
import { path } from "~/utils/path";

const InspectionDocumentEditor = lazy(
  () =>
    import(
      "~/modules/production/ui/InspectionDocument/InspectionDocumentEditor"
    )
);

type ApprovalContext = {
  approvalRequest: { id: string } | null;
  canApprove: boolean;
  canDelete: boolean;
  isApprovalRequired: boolean;
};

async function getInspectionDocumentApprovalContext(
  serviceRole: ReturnType<typeof getCarbonServiceRole>,
  documentId: string,
  status: string | null,
  companyId: string,
  userId: string
): Promise<ApprovalContext> {
  const defaultContext: ApprovalContext = {
    approvalRequest: null,
    canApprove: false,
    canDelete: true,
    isApprovalRequired: false
  };

  if (status !== "Draft" && status !== "Archived") {
    return defaultContext;
  }

  const [latest, approvalRequired] = await Promise.all([
    getLatestApprovalRequestForDocument(
      serviceRole,
      "inspectionDocument",
      documentId
    ),
    isApprovalRequired(serviceRole, "inspectionDocument", companyId, undefined)
  ]);

  const req = latest.data;
  if (!req || req.status !== "Pending" || !req.requestedBy || !req.id) {
    return { ...defaultContext, isApprovalRequired: approvalRequired };
  }

  const canApprove = await canApproveRequest(
    serviceRole,
    {
      amount: req.amount,
      documentType: req.documentType,
      companyId: req.companyId
    },
    userId
  );
  const isRequester = canCancelRequest(
    { requestedBy: req.requestedBy, status: req.status },
    userId
  );

  return {
    approvalRequest: { id: req.id },
    canApprove,
    canDelete: isRequester,
    isApprovalRequired: approvalRequired
  };
}

export const handle: Handle = {
  breadcrumb: (_params: unknown, data: any): BreadcrumbSegment[] => {
    const segments: BreadcrumbSegment[] = [
      { breadcrumb: msg`Production`, to: path.to.production },
      { breadcrumb: msg`Inspection Plans`, to: path.to.inspectionDocuments }
    ];
    const name = data?.diagram?.name;
    return name ? [...segments, { breadcrumb: name }] : segments;
  },
  module: "production"
};

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { userId } = await requirePermissions(request, {
    update: "quality"
  });

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const validation = await validator(
    inspectionDocumentApprovalValidator
  ).validate(await request.formData());

  if (validation.error) {
    return validationError(validation.error);
  }

  const { approvalRequestId, decision, notes } = validation.data;

  const serviceRole = getCarbonServiceRole();

  const approvalRequest = await getLatestApprovalRequestForDocument(
    serviceRole,
    "inspectionDocument",
    id
  );

  if (!approvalRequest.data || approvalRequest.data.id !== approvalRequestId) {
    throw redirect(
      path.to.inspectionDocument(id),
      await flash(request, error(null, "Approval request not found"))
    );
  }

  const canApprove = await canApproveRequest(
    serviceRole,
    {
      amount: approvalRequest.data.amount,
      documentType: approvalRequest.data.documentType,
      companyId: approvalRequest.data.companyId
    },
    userId
  );

  if (!canApprove) {
    throw redirect(
      path.to.inspectionDocument(id),
      await flash(
        request,
        error(null, "You do not have permission to approve this request")
      )
    );
  }

  const db = getDatabaseClient();
  const result =
    decision === "Approved"
      ? await approveRequest(db, approvalRequestId, userId, notes || undefined)
      : await rejectRequest(db, approvalRequestId, userId, notes || undefined);

  if (result.error) {
    throw redirect(
      path.to.inspectionDocument(id),
      await flash(
        request,
        error(
          result.error,
          result.error?.message ?? "Failed to process approval decision"
        )
      )
    );
  }

  const requestedBy = approvalRequest.data?.requestedBy;
  const companyId = approvalRequest.data?.companyId;
  if (requestedBy && companyId && requestedBy !== userId) {
    try {
      await trigger("notify", {
        event:
          decision === "Approved"
            ? NotificationEvent.ApprovalApproved
            : NotificationEvent.ApprovalRejected,
        companyId,
        documentId: id,
        documentType: "inspectionDocument",
        recipient: { type: "user", userId: requestedBy },
        from: userId
      });
    } catch (e) {
      console.error("Failed to trigger approval decision notification", e);
    }
  }

  throw redirect(
    path.to.inspectionDocument(id),
    await flash(
      request,
      success(`Approval request ${decision.toLowerCase()} successfully`)
    )
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    view: "quality"
  });

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const serviceRole = getCarbonServiceRole();
  const diagramPromise = getInspectionDocument(serviceRole, id);
  const [
    diagram,
    featuresResult,
    balloonsResult,
    unitOfMeasuresResult,
    companySettings,
    approval
  ] = await Promise.all([
    diagramPromise,
    getInspectionFeatures(serviceRole, id),
    getBalloons(serviceRole, id),
    getUnitOfMeasuresList(client, companyId),
    getCompanySettings(client, companyId),
    diagramPromise.then((d) =>
      getInspectionDocumentApprovalContext(
        serviceRole,
        id,
        d.data?.status ?? null,
        companyId,
        userId
      )
    )
  ]);

  if (diagram.error) {
    throw redirect(
      path.to.inspectionDocuments,
      await flash(
        request,
        error(diagram.error, "Failed to load inspection plan")
      )
    );
  }

  if (!diagram.data) {
    throw redirect(path.to.inspectionDocuments);
  }

  if (diagram.data.companyId !== companyId) {
    throw redirect(path.to.inspectionDocuments);
  }

  const features = featuresResult.data ?? [];
  const balloons = balloonsResult.data ?? [];

  const unitOfMeasures = unitOfMeasuresResult?.data ?? [];

  return {
    diagram: diagram.data,
    versions: getInspectionDocumentVersions(
      client,
      diagram.data.documentFamilyId,
      companyId
    ),
    features,
    balloons,
    unitOfMeasures,
    samplingStandard:
      ((companySettings.data as any)?.samplingStandard as
        | "ANSI_Z1_4"
        | "ISO_2859_1") ?? "ANSI_Z1_4",
    ...approval
  };
}

export default function BalloonDetailRoute() {
  const { diagram, features, balloons, unitOfMeasures, samplingStandard } =
    useLoaderData<typeof loader>();
  const content = diagram.content as InspectionDocumentContent | null;
  const readOnly = diagram.status !== "Draft";

  return (
    <div className="flex flex-col h-[calc(100dvh-49px)] overflow-hidden w-full">
      <InspectionDocumentHeader />
      {readOnly && (
        <div className="flex-shrink-0 border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          This version is read-only. Create a new version to make changes.
        </div>
      )}
      <ClientOnly
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            <Spinner className="h-8 w-8" />
          </div>
        }
      >
        {() => (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center">
                <Spinner className="h-8 w-8" />
              </div>
            }
          >
            <InspectionDocumentEditor
              diagramId={diagram.id}
              name={diagram.name}
              partId={diagram.partId}
              content={content}
              features={features}
              balloons={balloons}
              unitOfMeasures={unitOfMeasures}
              sampling={(diagram.sampling as SamplingRule | null) ?? null}
              samplingStandard={samplingStandard}
              readOnly={readOnly}
            />
          </Suspense>
        )}
      </ClientOnly>
    </div>
  );
}
