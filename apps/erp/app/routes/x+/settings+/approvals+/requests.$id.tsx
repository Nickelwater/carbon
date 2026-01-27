import { error, getCarbonServiceRole } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useNavigate } from "react-router";
import {
  approvalDecisionValidator,
  approveRequest,
  canApproveRequest,
  getApprovalById,
  rejectRequest
} from "~/modules/approvals";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { userId } = await requirePermissions(request, {
    role: "employee"
  });

  const serviceRole = getCarbonServiceRole();
  const { id } = params;
  if (!id) throw new Error("id is not found");

  const approval = await getApprovalById(serviceRole, id);
  if (approval.error || !approval.data) {
    throw redirect(
      path.to.approvalRequests,
      await flash(
        request,
        error(
          approval.error ?? new Error("Approval request not found"),
          "Approval request not found"
        )
      )
    );
  }

  // Check if user can approve/reject this request
  const canApprove = await canApproveRequest(
    serviceRole,
    approval.data,
    userId
  );
  if (!canApprove) {
    throw redirect(
      path.to.approvalRequests,
      await flash(
        request,
        error(
          new Error(
            "You do not have permission to approve/reject this request"
          ),
          "You do not have permission to approve or reject this request"
        )
      )
    );
  }

  if (approval.data.status !== "Pending") {
    throw redirect(
      path.to.approvalRequests,
      await flash(
        request,
        error(
          new Error("Approval request is not pending"),
          "Approval request is not pending"
        )
      )
    );
  }

  return { approval: approval.data };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { userId } = await requirePermissions(request, {
    role: "employee"
  });

  const serviceRole = getCarbonServiceRole();
  const { id } = params;
  if (!id) throw new Error("id is not found");

  const formData = await request.formData();
  const validation = await validator(approvalDecisionValidator).validate(
    formData
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { decision, decisionNotes } = validation.data;

  // Get approval request and check permissions
  const approval = await getApprovalById(serviceRole, id);
  if (approval.error || !approval.data) {
    throw redirect(
      path.to.approvalRequests,
      await flash(
        request,
        error(
          approval.error ?? new Error("Approval request not found"),
          "Approval request not found"
        )
      )
    );
  }

  // Check if user can approve/reject this request
  const canApprove = await canApproveRequest(
    serviceRole,
    approval.data,
    userId
  );
  if (!canApprove) {
    throw redirect(
      path.to.approvalRequests,
      await flash(
        request,
        error(
          new Error(
            "You do not have permission to approve/reject this request"
          ),
          "You do not have permission to approve or reject this request"
        )
      )
    );
  }

  if (approval.data.status !== "Pending") {
    throw redirect(
      path.to.approvalRequests,
      await flash(
        request,
        error(
          new Error("Approval request is not pending"),
          "Approval request is not pending"
        )
      )
    );
  }

  let result;
  if (decision === "Approved") {
    result = await approveRequest(serviceRole, id, userId, decisionNotes);
  } else {
    result = await rejectRequest(serviceRole, id, userId, decisionNotes);
  }

  if (result.error) {
    // Return JSON error for fetcher requests
    // Regular form submissions will be handled by the redirect below
    return Response.json(
      { error: result.error.message, success: false },
      { status: 400 }
    );
  }

  // Return JSON response for fetcher requests
  // The modal will handle the response and refresh the data
  return Response.json({
    success: true,
    message:
      decision === "Approved"
        ? "Approval request approved"
        : "Approval request rejected"
  });
}

export default function ApprovalDecisionRoute() {
  // This route is only used for the action handler (POST requests via fetcher)
  // If accessed directly via GET, redirect to the requests list
  // The modal in ApprovalsTable handles the UI
  const navigate = useNavigate();

  useEffect(() => {
    navigate(path.to.approvalRequests, { replace: true });
  }, [navigate]);

  return null;
}
