import { error, getCarbonServiceRole, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigate } from "react-router";
import { approvalRuleValidator, upsertApprovalRule } from "~/modules/approvals";
import ApprovalRuleDrawer from "~/modules/approvals/ui/ApprovalRuleDrawer";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "settings",
    role: "employee"
  });

  const groupsResult = await client
    .from("group")
    .select("id, name")
    .eq("companyId", companyId)
    .eq("isCustomerOrgGroup", false)
    .eq("isSupplierOrgGroup", false);

  return {
    rule: null,
    documentType: null,
    groups: groupsResult.data ?? []
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { companyId, userId } = await requirePermissions(request, {
    update: "settings",
    role: "employee"
  });

  const serviceRole = getCarbonServiceRole();

  const formData = await request.formData();
  const validation = await validator(approvalRuleValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const result = await upsertApprovalRule(serviceRole, {
    createdBy: userId,
    companyId,
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
      path.to.newApprovalRule(),
      await flash(request, error(result.error, result.error.message))
    );
  }

  throw redirect(
    path.to.approvalRules,
    await flash(request, success("Approval rule created"))
  );
}

export default function NewApprovalRuleRoute() {
  const { rule, documentType, groups } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const onClose = () => navigate(path.to.approvalRules);

  return (
    <ApprovalRuleDrawer
      rule={rule}
      documentType={documentType}
      groups={groups}
      onClose={onClose}
    />
  );
}
