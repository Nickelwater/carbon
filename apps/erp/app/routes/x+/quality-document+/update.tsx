import { getCarbonServiceRole } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { type ActionFunctionArgs } from "react-router";
import {
  createApprovalRequest,
  getApprovalRuleByAmount,
  hasPendingApproval,
  isApprovalRequired
} from "~/modules/approvals";
import { qualityDocumentStatus } from "~/modules/quality/quality.models";

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "quality"
  });

  const serviceRole = getCarbonServiceRole();
  const formData = await request.formData();
  const ids = formData.getAll("ids");
  const field = formData.get("field");
  const value = formData.get("value");

  if (typeof field !== "string" || typeof value !== "string") {
    return { error: { message: "Invalid form data" }, data: null };
  }

  switch (field) {
    case "content":
    case "name":
      return await client
        .from("qualityDocument")
        .update({
          [field]: value,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .in("id", ids as string[]);
    case "status":
      // When status changes to "Active", check if approval is required
      if (value === "Active") {
        const currentDocs = await client
          .from("qualityDocument")
          .select("id, status")
          .in("id", ids as string[]);

        if (currentDocs.error) {
          return { error: currentDocs.error, data: null };
        }

        // Process each document that's changing from Draft to Active
        for (const doc of currentDocs.data ?? []) {
          if (doc.status === "Draft") {
            const approvalRequired = await isApprovalRequired(
              serviceRole,
              "qualityDocument",
              companyId,
              undefined
            );

            if (approvalRequired) {
              const hasPending = await hasPendingApproval(
                serviceRole,
                "qualityDocument",
                doc.id
              );

              if (!hasPending) {
                const config = await getApprovalRuleByAmount(
                  serviceRole,
                  "qualityDocument",
                  companyId,
                  undefined
                );

                await createApprovalRequest(serviceRole, {
                  documentType: "qualityDocument",
                  documentId: doc.id,
                  companyId,
                  requestedBy: userId,
                  createdBy: userId,
                  approverGroupIds: config.data?.approverGroupIds || undefined,
                  approverId: config.data?.defaultApproverId || undefined
                });
              }
            }
          }
        }
      }

      return await client
        .from("qualityDocument")
        .update({
          [field]: value as (typeof qualityDocumentStatus)[number],
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .in("id", ids as string[]);
    case "tags":
      return await client
        .from("qualityDocument")
        .update({
          [field]: formData.getAll("value") as string[],
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .in("id", ids as string[]);

    default:
      return { error: { message: "Invalid field" }, data: null };
  }
}
