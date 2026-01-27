import { error, getCarbonServiceRole, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigate } from "react-router";
import { useUrlParams } from "~/hooks";
import {
  approvalRuleValidator,
  getApprovalRules,
  upsertApprovalRule
} from "~/modules/approvals";
import ApprovalRuleDrawer from "~/modules/approvals/ui/ApprovalRuleDrawer";
import { getParams, path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    view: "settings",
    role: "employee"
  });

  const { id } = params;
  if (!id) throw new Error("Rule ID is required");

  const serviceRole = getCarbonServiceRole();

  const [rules, groupsResult] = await Promise.all([
    getApprovalRules(serviceRole, companyId),
    client
      .from("group")
      .select("id, name")
      .eq("companyId", companyId)
      .eq("isCustomerOrgGroup", false)
      .eq("isSupplierOrgGroup", false)
  ]);

  if (rules.error) {
    throw redirect(
      path.to.approvalRules,
      await flash(request, error(rules.error, "Failed to load approval rule"))
    );
  }

  if (groupsResult.error) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(groupsResult.error, "Failed to load approver groups")
      )
    );
  }

  const rule = rules.data?.find((r) => r.id === id);

  if (!rule) {
    throw redirect(
      path.to.approvalRules,
      await flash(request, error(null, "Approval rule not found"))
    );
  }

  // Check if user can edit (only creator can edit)
  const canEdit = rule.createdBy === userId;

  return {
    rule,
    groups: groupsResult.data ?? [],
    canEdit
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {
    update: "settings",
    role: "employee"
  });

  const serviceRole = getCarbonServiceRole();
  const { id } = params;
  if (!id) throw new Error("Rule ID is required");

  const formData = await request.formData();
  const validation = await validator(approvalRuleValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  // Get existing rule to check permissions
  const rules = await getApprovalRules(serviceRole, companyId);
  const existingRule = rules.data?.find((r) => r.id === id);

  if (!existingRule) {
    throw redirect(
      path.to.approvalRules,
      await flash(request, error(null, "Approval rule not found"))
    );
  }

  // Only the creator can edit their own rule
  if (existingRule.createdBy !== userId) {
    throw redirect(
      path.to.approvalRules,
      await flash(
        request,
        error(null, "Only the creator can edit this approval rule")
      )
    );
  }

  const result = await upsertApprovalRule(serviceRole, {
    id,
    updatedBy: userId,
    name: validation.data.name,
    documentType: validation.data.documentType,
    enabled: validation.data.enabled,
    approverGroupIds: validation.data.approverGroupIds || [],
    defaultApproverId: validation.data.defaultApproverId,
    lowerBoundAmount: validation.data.lowerBoundAmount ?? 0,
    upperBoundAmount: validation.data.upperBoundAmount ?? null,
    escalationDays: validation.data.escalationDays
  });

  if (result.error) {
    throw redirect(
      `${path.to.approvalRule(id)}?${getParams(request)}`,
      await flash(request, error(result.error, result.error.message))
    );
  }

  throw redirect(
    `${path.to.approvalRules}?${getParams(request)}`,
    await flash(request, success("Approval rule updated"))
  );
}

export default function EditApprovalRuleRoute() {
  const { rule, groups, canEdit } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [params] = useUrlParams();
  const onClose = () =>
    navigate(`${path.to.approvalRules}?${params.toString()}`);

  return (
    <ApprovalRuleDrawer
      rule={rule}
      documentType={rule.documentType}
      groups={groups}
      canEdit={canEdit}
      onClose={onClose}
    />
  );
}
