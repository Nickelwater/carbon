import type { Database } from "@carbon/database";
import { getPurchaseOrderStatus } from "@carbon/utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPurchaseOrderLines } from "~/modules/purchasing";
import type { GenericQueryFilters } from "~/utils/query";
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
  if (approvalRequest.requestedBy === userId) {
    return true;
  }

  return canApproveRequest(
    client,
    {
      amount: approvalRequest.amount,
      documentType: approvalRequest.documentType,
      companyId: approvalRequest.companyId
    },
    userId
  );
}

export async function canApproveRequest(
  client: SupabaseClient<Database>,
  approvalRequest: ApprovalRequestForApproveCheck,
  userId: string
): Promise<boolean> {
  const rule = await getApprovalRuleByAmount(
    client,
    approvalRequest.documentType,
    approvalRequest.companyId,
    approvalRequest.amount ?? undefined
  );

  if (!rule.data) {
    return false;
  }

  if (rule.data.defaultApproverId === userId) {
    return true;
  }

  const approverGroupIds = rule.data.approverGroupIds;
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

export async function createApprovalRequest(
  client: SupabaseClient<Database>,
  request: CreateApprovalRequestInput & { amount?: number }
) {
  return client
    .from("approvalRequest")
    .insert([
      {
        documentType: request.documentType,
        documentId: request.documentId,
        requestedBy: request.requestedBy,
        amount: request.amount ?? null,
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

  if (approvalUpdate.data) {
    const { documentType, documentId } = approvalUpdate.data;

    if (documentType === "purchaseOrder") {
      await client
        .from("purchaseOrder")
        .update({
          status: "Rejected",
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

export async function getApprovalById(
  client: SupabaseClient<Database>,
  id: string
) {
  const baseRequest = await client
    .from("approvalRequest")
    .select("*")
    .eq("id", id)
    .single();

  if (baseRequest.error || !baseRequest.data) {
    return baseRequest;
  }

  const viewData = await client
    .from("approvalRequests")
    .select("documentReadableId, documentDescription")
    .eq("id", id)
    .single();

  return {
    data: {
      ...baseRequest.data,
      documentReadableId: viewData.data?.documentReadableId ?? null,
      documentDescription: viewData.data?.documentDescription ?? null
    },
    error: null
  };
}

export async function getLatestApprovalRequestForDocument(
  client: SupabaseClient<Database>,
  documentType: (typeof approvalDocumentType)[number],
  documentId: string
) {
  const baseRequest = await client
    .from("approvalRequest")
    .select("*")
    .eq("documentType", documentType)
    .eq("documentId", documentId)
    .order("requestedAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (baseRequest.error || !baseRequest.data) {
    return baseRequest;
  }

  const viewData = await client
    .from("approvalRequests")
    .select("documentReadableId, documentDescription")
    .eq("id", baseRequest.data.id)
    .single();

  return {
    data: {
      ...baseRequest.data,
      documentReadableId: viewData.data?.documentReadableId ?? null,
      documentDescription: viewData.data?.documentDescription ?? null
    },
    error: null
  };
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

export async function getApprovalsForUser(
  client: SupabaseClient<Database>,
  userId: string,
  companyId: string,
  args?: GenericQueryFilters & ApprovalFilters
) {
  let query = client
    .from("approvalRequest")
    .select("*", { count: "exact" })
    .eq("companyId", companyId)
    .eq("requestedBy", userId);

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

  const requestedByUserBase = await query;

  // Get readable fields from view for requestedByUser
  const requestedByUser = await Promise.all(
    (requestedByUserBase.data || []).map(async (approval) => {
      const viewData = await client
        .from("approvalRequests")
        .select("documentReadableId, documentDescription")
        .eq("id", approval.id)
        .single();

      return {
        ...approval,
        documentReadableId: viewData.data?.documentReadableId ?? null,
        documentDescription: viewData.data?.documentDescription ?? null
      };
    })
  );

  let pendingQuery = client
    .from("approvalRequest")
    .select("*")
    .eq("companyId", companyId)
    .eq("status", "Pending")
    .neq("requestedBy", userId);

  if (args?.documentType) {
    pendingQuery = pendingQuery.eq("documentType", args.documentType);
  }

  if (args?.dateFrom) {
    pendingQuery = pendingQuery.gte("requestedAt", args.dateFrom);
  }
  if (args?.dateTo) {
    pendingQuery = pendingQuery.lte("requestedAt", args.dateTo);
  }

  const allPending = await pendingQuery;

  const pendingWithReadableFields = await Promise.all(
    (allPending.data || []).map(async (approval) => {
      const viewData = await client
        .from("approvalRequests")
        .select("documentReadableId, documentDescription")
        .eq("id", approval.id)
        .single();

      return {
        ...approval,
        documentReadableId: viewData.data?.documentReadableId ?? null,
        documentDescription: viewData.data?.documentDescription ?? null
      };
    })
  );

  const canApprovePromises = pendingWithReadableFields.map(async (approval) => {
    const canApprove = await canApproveRequest(
      client,
      {
        amount: approval.amount,
        documentType: approval.documentType,
        companyId: approval.companyId
      },
      userId
    );
    return canApprove ? approval : null;
  });

  const approvableByUser = (await Promise.all(canApprovePromises)).filter(
    (approval): approval is NonNullable<typeof approval> => approval !== null
  );

  const allApprovals = [...requestedByUser, ...approvableByUser];

  let filtered = allApprovals;
  if (args?.status && args.status !== "Pending") {
    filtered = allApprovals.filter((a) => a.status === args.status);
  }

  filtered.sort((a, b) => {
    const aDate = new Date(a.requestedAt).getTime();
    const bDate = new Date(b.requestedAt).getTime();
    return bDate - aDate;
  });

  if (args?.limit) {
    const offset = args.offset || 0;
    filtered = filtered.slice(offset, offset + args.limit);
  }

  return {
    data: filtered,
    count: requestedByUserBase.count ?? allApprovals.length,
    error: null
  };
}

export async function getPendingApprovalsForApprover(
  client: SupabaseClient<Database>,
  userId: string,
  companyId: string
) {
  const allPending = await client
    .from("approvalRequest")
    .select("*")
    .eq("companyId", companyId)
    .eq("status", "Pending")
    .order("requestedAt", { ascending: false });

  if (allPending.error || !allPending.data) {
    return allPending;
  }

  const pendingWithReadableFields = await Promise.all(
    allPending.data.map(async (approval) => {
      const viewData = await client
        .from("approvalRequests")
        .select("documentReadableId, documentDescription")
        .eq("id", approval.id)
        .single();

      return {
        ...approval,
        documentReadableId: viewData.data?.documentReadableId ?? null,
        documentDescription: viewData.data?.documentDescription ?? null
      };
    })
  );

  const canApprovePromises = pendingWithReadableFields.map(async (approval) => {
    const canApprove = await canApproveRequest(
      client,
      {
        amount: approval.amount,
        documentType: approval.documentType,
        companyId: approval.companyId
      },
      userId
    );
    return canApprove ? approval : null;
  });

  const approvableByUser = (await Promise.all(canApprovePromises)).filter(
    (approval): approval is NonNullable<typeof approval> => approval !== null
  );

  return {
    data: approvableByUser,
    error: null
  };
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

export async function deleteApprovalRule(
  client: SupabaseClient<Database>,
  id: string,
  companyId: string
) {
  return client
    .from("approvalRule")
    .delete()
    .eq("id", id)
    .eq("companyId", companyId);
}

export async function getApprovalRuleById(
  client: SupabaseClient<Database>,
  id: string,
  companyId: string
) {
  return client
    .from("approvalRule")
    .select("*")
    .eq("id", id)
    .eq("companyId", companyId)
    .single();
}

export async function getApprovalRules(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return client.from("approvalRule").select("*").eq("companyId", companyId);
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
    query = query.lte("lowerBoundAmount", amount);
  } else {
    query = query.eq("lowerBoundAmount", 0);
  }

  return query
    .order("lowerBoundAmount", { ascending: false })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
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
