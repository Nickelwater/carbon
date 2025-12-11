import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { redirect } from "@remix-run/react";
import type { ActionFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { insertTrainingCompletion } from "~/modules/people";
import { path } from "~/utils/path";

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "people",
    role: "employee",
  });

  const formData = await request.formData();
  const trainingAssignmentId = formData.get("trainingAssignmentId");
  const employeeId = formData.get("employeeId");
  const period = formData.get("period");

  if (!trainingAssignmentId || !employeeId) {
    return json(
      { error: "Missing required fields" },
      {
        status: 400,
        headers: await flash(
          request,
          error(null, "Missing required fields")
        ),
      }
    );
  }

  const result = await insertTrainingCompletion(client, {
    trainingAssignmentId: trainingAssignmentId.toString(),
    employeeId: employeeId.toString(),
    period: period?.toString() || null,
    companyId,
    completedBy: userId,
    createdBy: userId,
  });

  if (result.error) {
    return json(
      { error: result.error.message },
      {
        status: 500,
        headers: await flash(
          request,
          error(result.error, "Failed to mark training complete")
        ),
      }
    );
  }

  return json(
    { success: true },
    {
      headers: await flash(
        request,
        success("Training marked as complete")
      ),
    }
  );
}

export async function loader() {
  return redirect(path.to.trainingAssignments);
}
