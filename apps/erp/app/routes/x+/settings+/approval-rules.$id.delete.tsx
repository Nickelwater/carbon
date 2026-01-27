import { error, getCarbonServiceRole, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getApprovalRules } from "~/modules/approvals";
import { getParams, path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {
    update: "settings",
    role: "employee"
  });

  const { id } = params;
  if (!id) throw new Error("Rule ID is required");

  const serviceRole = getCarbonServiceRole();
  const rules = await getApprovalRules(serviceRole, companyId);

  if (rules.error) {
    throw redirect(
      path.to.approvalRules,
      await flash(request, error(rules.error, "Failed to load approval rule"))
    );
  }

  const rule = rules.data?.find((r) => r.id === id);

  if (!rule) {
    throw redirect(
      path.to.approvalRules,
      await flash(request, error(null, "Approval rule not found"))
    );
  }

  if (rule.createdBy !== userId) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(null, "Only the creator can delete this approval rule")
      )
    );
  }

  return { rule };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {
    update: "settings",
    role: "employee"
  });

  const { id } = params;
  if (!id) throw new Error("Rule ID is required");

  const serviceRole = getCarbonServiceRole();

  // Verify user is creator before deleting
  const rules = await getApprovalRules(serviceRole, companyId);
  const rule = rules.data?.find((r) => r.id === id);

  if (!rule) {
    throw redirect(
      path.to.approvalRules,
      await flash(request, error(null, "Approval rule not found"))
    );
  }

  if (rule.createdBy !== userId) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(null, "Only the creator can delete this approval rule")
      )
    );
  }

  // Check for pending approval requests that might be using this rule
  const pendingRequests = await serviceRole
    .from("approvalRequest")
    .select("id, approverGroupIds, approverId")
    .eq("companyId", companyId)
    .eq("status", "Pending")
    .eq("documentType", rule.documentType);

  if (pendingRequests.error) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(pendingRequests.error, "Failed to check for pending approvals")
      )
    );
  }

  // Check if any pending requests match this rule's approvers
  const matchingRequests = pendingRequests.data?.filter((req) => {
    // Check if request has matching approver groups
    if (rule.approverGroupIds && rule.approverGroupIds.length > 0) {
      const requestGroups = req.approverGroupIds || [];
      const hasMatchingGroup = requestGroups.some((groupId) =>
        rule.approverGroupIds?.includes(groupId)
      );
      if (hasMatchingGroup) return true;
    }

    // Check if request has matching default approver
    if (rule.defaultApproverId && req.approverId === rule.defaultApproverId) {
      return true;
    }

    return false;
  });

  if (matchingRequests && matchingRequests.length > 0) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(
          null,
          `Cannot delete this rule because there are ${matchingRequests.length} pending approval request(s) that may be using it. Please resolve or cancel those requests first.`
        )
      )
    );
  }

  let result = await serviceRole
    .from("approvalRule")
    .delete()
    .eq("id", id)
    .eq("companyId", companyId)
    .select();

  if (result.error) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(result.error, "Failed to delete approval rule")
      )
    );
  }

  if (!result.data || result.data.length === 0) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(null, "Approval rule not found or already deleted")
      )
    );
  }

  throw redirect(
    `${path.to.approvalRules}?${getParams(request)}`,
    await flash(request, success("Approval rule deleted successfully"))
  );
}

export default function DeleteApprovalRuleRoute() {
  return null;
}
