import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { redirect } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@vercel/remix";
import { deleteTrainingAssignment } from "~/modules/people";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  throw redirect(path.to.trainingAssignments);
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { client } = await requirePermissions(request, {
    delete: "people",
    role: "employee",
  });

  const { assignmentId } = params;
  if (!assignmentId) {
    throw redirect(
      path.to.trainingAssignments,
      await flash(request, error(null, "Assignment ID is required"))
    );
  }

  const result = await deleteTrainingAssignment(client, assignmentId);

  if (result.error) {
    throw redirect(
      path.to.trainingAssignments,
      await flash(
        request,
        error(result.error, "Failed to delete assignment")
      )
    );
  }

  throw redirect(
    path.to.trainingAssignments,
    await flash(request, success("Assignment deleted successfully"))
  );
}
