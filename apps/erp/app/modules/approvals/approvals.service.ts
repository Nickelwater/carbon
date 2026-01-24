import type { Database } from "@carbon/database";
import { getPurchaseOrderStatus } from "@carbon/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPurchaseOrderLines } from "~/modules/purchasing";
import type { GenericQueryFilters } from "~/utils/query";
import { setGenericQueryFilters } from "~/utils/query";
import { sanitize } from "~/utils/supabase";
import type { approvalDocumentType } from "./approvals.models";
import type {
  ApprovalFilters,
  ApprovalRequestForApproveCheck,
  ApprovalRequestForCancelCheck,
  ApprovalRequestForViewCheck,
  CreateApprovalRequestInput,
  UpsertApprovalRuleInput
} from "./types";

export async function canViewApprovalRequest(
  client: SupabaseClient<Database>,
  approvalRequest: ApprovalRequestForViewCheck,
  userId: string
): Promise<boolean> {
  if (
    approvalRequest.requestedBy === userId ||
    approvalRequest.approverId === userId
  ) {
    return true;
  }

  const approverGroupIds = approvalRequest.approverGroupIds;
  if (!approverGroupIds || approverGroupIds.length === 0) {
    return false;
  }

  const userGroups = await client.rpc("groups_for_user", { uid: userId });
  const userGroupIds = userGroups.data || [];
  return approverGroupIds.some((groupId) => userGroupIds.includes(groupId));
}

export async function canApproveRequest(
  client: SupabaseClient<Database>,
  approvalRequest: ApprovalRequestForApproveCheck,
  userId: string
): Promise<boolean> {
  if (approvalRequest.approverId === userId) {
    return true;
  }

  const approverGroupIds = approvalRequest.approverGroupIds;
  if (!approverGroupIds || approverGroupIds.length === 0) {
    return false;
  }

  const userGroups = await client.rpc("groups_for_user", { uid: userId });
  const userGroupIds = userGroups.data || [];
  return approverGroupIds.some((groupId) => userGroupIds.includes(groupId));
}

export function canCancelRequest(
  approvalRequest: ApprovalRequestForCancelCheck,
  userId: string
): boolean {
  return (
    approvalRequest.requestedBy === userId &&
    approvalRequest.status === "Pending"
  );
}

export async function getApprovalsForUser(
  client: SupabaseClient<Database>,
  userId: string,
  companyId: string,
  args?: GenericQueryFilters & ApprovalFilters
) {
  const userGroups = await client.rpc("groups_for_user", { uid: userId });
  const groupIds = userGroups.data || [];

  let query = client
    .from("approvalRequests")
    .select("*", { count: "exact" })
    .eq("companyId", companyId);

  if (args?.documentType) {
    query = query.eq("documentType", args.documentType);
  }

  if (args?.status) {
    query = query.eq("status", args.status);
  }

  if (args?.dateFrom) {
    query = query.gte("requestedAt", args.dateFrom);
  }
  if (args?.dateTo) {
    query = query.lte("requestedAt", args.dateTo);
  }

  if (groupIds.length > 0) {
    const groupConditions = groupIds
      .map((gid: string) => `approverGroupIds.cs.{${gid}}`)
      .join(",");
    query = query.or(
      `requestedBy.eq.${userId},approverId.eq.${userId},${groupConditions}`
    );
  } else {
    query = query.or(`requestedBy.eq.${userId},approverId.eq.${userId}`);
  }

  if (args) {
    query = setGenericQueryFilters(query, args, [
      { column: "requestedAt", ascending: false }
    ]);
  }

  return query;
}

export async function getPendingApprovalsForApprover(
  client: SupabaseClient<Database>,
  userId: string,
  companyId: string
) {
  const userGroups = await client.rpc("groups_for_user", { uid: userId });
  const groupIds = userGroups.data || [];

  let query = client
    .from("approvalRequests")
    .select("*")
    .eq("companyId", companyId)
    .eq("status", "Pending");

  if (groupIds.length > 0) {
    const groupConditions = groupIds
      .map((gid: string) => `approverGroupIds.cs.{${gid}}`)
      .join(",");
    query = query.or(`approverId.eq.${userId},${groupConditions}`);
  } else {
    query = query.eq("approverId", userId);
  }

  return query.order("requestedAt", { ascending: false });
}

export async function getApprovalById(
  client: SupabaseClient<Database>,
  id: string
) {
  return client.from("approvalRequests").select("*").eq("id", id).single();
}

export async function getLatestApprovalForDocument(
  client: SupabaseClient<Database>,
  documentType: (typeof approvalDocumentType)[number],
  documentId: string
) {
  return client
    .from("approvalRequests")
    .select("*")
    .eq("documentType", documentType)
    .eq("documentId", documentId)
    .order("requestedAt", { ascending: false })
    .limit(1)
    .single();
}

export async function createApprovalRequest(
  client: SupabaseClient<Database>,
  request: CreateApprovalRequestInput & { amount?: number }
) {
  const config = await getApprovalRuleByAmount(
    client,
    request.documentType,
    request.companyId,
    request.amount
  );

  const approverGroupIds =
    request.approverGroupIds || config.data?.approverGroupIds || [];
  const approverId = request.approverId || config.data?.defaultApproverId;

  return client
    .from("approvalRequest")
    .insert([
      {
        documentType: request.documentType,
        documentId: request.documentId,
        requestedBy: request.requestedBy,
        approverGroupIds: approverGroupIds.length > 0 ? approverGroupIds : [],
        approverId: approverId || null,
        companyId: request.companyId,
        createdBy: request.createdBy
      }
    ])
    .select("id")
    .single();
}

export async function approveRequest(
  client: SupabaseClient<Database>,
  id: string,
  userId: string,
  notes?: string
) {
  const approvalRequest = await client
    .from("approvalRequest")
    .select("id, status, documentType, documentId, companyId")
    .eq("id", id)
    .single();

  if (approvalRequest.error || !approvalRequest.data) {
    return { error: { message: "Approval request not found" }, data: null };
  }

  if (approvalRequest.data.status !== "Pending") {
    return {
      error: { message: "Approval request is not pending" },
      data: null
    };
  }

  const approvalUpdate = await client
    .from("approvalRequest")
    .update({
      status: "Approved",
      decisionBy: userId,
      decisionAt: new Date().toISOString(),
      decisionNotes: notes || null,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .select("id, documentType, documentId")
    .single();

  if (approvalUpdate.error) {
    return { error: approvalUpdate.error, data: null };
  }

  // Update document status based on type
  if (approvalUpdate.data) {
    const { documentType, documentId } = approvalUpdate.data;

    if (documentType === "purchaseOrder") {
      const lines = await getPurchaseOrderLines(client, documentId);
      const { status: calculatedStatus } = getPurchaseOrderStatus(
        lines.data || []
      );

      const statusUpdate = await client
        .from("purchaseOrder")
        .update({
          status: calculatedStatus,
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .eq("id", documentId)
        .eq("status", "Needs Approval")
        .select("id")
        .single();

      if (statusUpdate.error) {
        console.warn(
          `Failed to update PO ${documentId} status after approval:`,
          statusUpdate.error
        );
      }
    } else if (documentType === "qualityDocument") {
      // Update quality document to "Active" when approved
      await client
        .from("qualityDocument")
        .update({
          status: "Active",
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .eq("id", documentId);
    }
  }

  return approvalUpdate;
}

export async function rejectRequest(
  client: SupabaseClient<Database>,
  id: string,
  userId: string,
  notes?: string
) {
  const existing = await client
    .from("approvalRequest")
    .select("id, status, documentType, documentId")
    .eq("id", id)
    .single();

  if (existing.error || !existing.data) {
    return { error: { message: "Approval request not found" }, data: null };
  }

  if (existing.data.status !== "Pending") {
    return {
      error: { message: "Approval request is not pending" },
      data: null
    };
  }

  const approvalUpdate = await client
    .from("approvalRequest")
    .update({
      status: "Rejected",
      decisionBy: userId,
      decisionAt: new Date().toISOString(),
      decisionNotes: notes || null,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .select("id, documentType, documentId")
    .single();

  if (approvalUpdate.error) {
    return { error: approvalUpdate.error, data: null };
  }

  // Update document status based on type
  if (approvalUpdate.data) {
    const { documentType, documentId } = approvalUpdate.data;

    if (documentType === "purchaseOrder") {
      // Update purchase order from "Needs Approval" back to "Draft"
      await client
        .from("purchaseOrder")
        .update({
          status: "Draft",
          updatedBy: userId,
          updatedAt: new Date().toISOString()
        })
        .eq("id", documentId)
        .eq("status", "Needs Approval");
    } else if (documentType === "qualityDocument") {
      // Keep quality document as "Draft" when rejected
      // (No status change needed, it should remain in Draft)
    }
  }

  return approvalUpdate;
}

export async function cancelApprovalRequest(
  client: SupabaseClient<Database>,
  id: string,
  userId: string
) {
  const existing = await client
    .from("approvalRequest")
    .select("id, status, requestedBy")
    .eq("id", id)
    .single();

  if (existing.error || !existing.data) {
    return { error: { message: "Approval request not found" }, data: null };
  }

  if (existing.data.status !== "Pending") {
    return {
      error: { message: "Approval request is not pending" },
      data: null
    };
  }

  if (existing.data.requestedBy !== userId) {
    return {
      error: { message: "Only the requester can cancel an approval request" },
      data: null
    };
  }

  return client
    .from("approvalRequest")
    .update({
      status: "Cancelled",
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id)
    .select("id")
    .single();
}

export async function getApprovalRequestsByDocument(
  client: SupabaseClient<Database>,
  documentType: (typeof approvalDocumentType)[number],
  documentId: string
) {
  return client
    .from("approvalRequests")
    .select("*")
    .eq("documentType", documentType)
    .eq("documentId", documentId)
    .order("requestedAt", { ascending: false });
}

export async function getApprovalRuleByAmount(
  client: SupabaseClient<Database>,
  documentType: (typeof approvalDocumentType)[number],
  companyId: string,
  amount?: number
) {
  let query = client
    .from("approvalRule")
    .select("*")
    .eq("documentType", documentType)
    .eq("companyId", companyId)
    .eq("enabled", true);

  if (amount !== undefined && amount !== null) {
    query = query
      .lte("lowerBoundAmount", amount)
      .or(`upperBoundAmount.is.null,upperBoundAmount.gt.${amount}`);
  } else {
    query = query.is("upperBoundAmount", null).eq("lowerBoundAmount", 0);
  }

  return query
    .order("lowerBoundAmount", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function getApprovalRules(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client.from("approvalRule").select("*").eq("companyId", companyId);
}

export async function upsertApprovalRule(
  client: SupabaseClient<Database>,
  rule: UpsertApprovalRuleInput
) {
  if ("id" in rule) {
    const existing = await client
      .from("approvalRule")
      .select("companyId")
      .eq("id", rule.id)
      .single();

    if (existing.error || !existing.data) {
      return {
        data: null,
        error: existing.error || { message: "Rule not found" }
      };
    }

    return client
      .from("approvalRule")
      .update(sanitize(rule))
      .eq("id", rule.id)
      .eq("companyId", existing.data.companyId)
      .select("id")
      .single();
  }
  return client.from("approvalRule").insert([rule]).select("id").single();
}

export async function isApprovalRequired(
  client: SupabaseClient<Database>,
  documentType: (typeof approvalDocumentType)[number],
  companyId: string,
  amount?: number
): Promise<boolean> {
  const config = await getApprovalRuleByAmount(
    client,
    documentType,
    companyId,
    amount
  );

  if (!config.data) {
    return false;
  }

  return config.data.enabled;
}

export async function hasPendingApproval(
  client: SupabaseClient<Database>,
  documentType: (typeof approvalDocumentType)[number],
  documentId: string
): Promise<boolean> {
  const result = await client
    .from("approvalRequest")
    .select("id")
    .eq("documentType", documentType)
    .eq("documentId", documentId)
    .eq("status", "Pending")
    .limit(1);

  return (result.data?.length ?? 0) > 0;
}

export async function getApprovalCounts(
  client: SupabaseClient<Database>,
  userId: string,
  companyId: string
) {
  const userGroups = await client.rpc("groups_for_user", { uid: userId });
  const groupIds = userGroups.data || [];

  let pendingQuery = client
    .from("approvalRequest")
    .select("id", { count: "exact", head: true })
    .eq("companyId", companyId)
    .eq("status", "Pending");

  if (groupIds.length > 0) {
    const groupConditions = groupIds
      .map((gid: string) => `approverGroupIds.cs.{${gid}}`)
      .join(",");
    pendingQuery = pendingQuery.or(
      `approverId.eq.${userId},${groupConditions}`
    );
  } else {
    pendingQuery = pendingQuery.eq("approverId", userId);
  }

  const pending = await pendingQuery;

  return {
    pending: pending.count ?? 0
  };
}
