import { validationError, validator } from "@carbon/form";
import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { NotificationEvent } from "@carbon/notifications";
import { redirect, useLoaderData, useNavigate, useParams } from "@remix-run/react";
import { tasks } from "@trigger.dev/sdk";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import {
  getTrainingAssignment,
  getTrainingAssignmentStatus,
  getTrainingsList,
  trainingAssignmentValidator,
  upsertTrainingAssignment,
} from "~/modules/people";
import type { TrainingAssignmentStatusItem, TrainingListItem } from "~/modules/people/types";
import TrainingAssignmentForm from "~/modules/people/ui/Training/TrainingAssignmentForm";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const handle: Handle = {
  breadcrumb: "Edit Assignment",
  to: path.to.trainingAssignments,
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "people",
    role: "employee",
  });

  const { assignmentId } = params;
  if (!assignmentId) {
    throw redirect(
      path.to.trainingAssignments,
      await flash(request, error(null, "Assignment ID is required"))
    );
  }

  const [assignment, trainings, assignmentStatus] = await Promise.all([
    getTrainingAssignment(client, assignmentId),
    getTrainingsList(client, companyId),
    getTrainingAssignmentStatus(client, companyId, {
      // We'll filter by trainingId which we'll get from the assignment
    }),
  ]);

  if (assignment.error) {
    throw redirect(
      path.to.trainingAssignments,
      await flash(request, error(assignment.error, "Error loading assignment"))
    );
  }

  if (trainings.error) {
    throw redirect(
      path.to.trainingAssignments,
      await flash(request, error(trainings.error, "Error loading trainings"))
    );
  }

  // Filter assignment status by trainingAssignmentId
  const filteredStatus = (assignmentStatus.data ?? []).filter(
    (s) => s.trainingAssignmentId === assignmentId
  );

  const currentPeriod =
    filteredStatus.length > 0 ? filteredStatus[0].currentPeriod : null;

  return json({
    assignment: assignment.data,
    trainings: (trainings.data ?? []) as TrainingListItem[],
    assignmentStatus: filteredStatus as TrainingAssignmentStatusItem[],
    currentPeriod,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "people",
    role: "employee",
  });

  const { assignmentId } = params;
  if (!assignmentId) {
    return json(
      { error: "Assignment ID is required" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const validation = await validator(trainingAssignmentValidator).validate(
    formData
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { trainingId, groupIds } = validation.data;

  const result = await upsertTrainingAssignment(client, {
    id: assignmentId,
    trainingId,
    groupIds,
    companyId: "", // not used for updates
    updatedBy: userId,
  });

  if (result.error) {
    return json(
      { error: result.error.message },
      {
        status: 500,
        headers: await flash(
          request,
          error(result.error, "Failed to update assignment")
        ),
      }
    );
  }

  // Send notifications to all users in the assigned groups
  try {
    await tasks.trigger("notify", {
      companyId,
      documentId: assignmentId,
      event: NotificationEvent.TrainingAssignment,
      recipient: {
        type: "group",
        groupIds,
      },
      from: userId,
    });
  } catch (err) {
    console.error("Failed to send training assignment notifications", err);
  }

  throw redirect(
    path.to.trainingAssignments,
    await flash(request, success("Assignment updated successfully"))
  );
}

export default function EditTrainingAssignmentRoute() {
  const { assignment, trainings, assignmentStatus, currentPeriod } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const params = useParams();

  const initialValues = {
    id: params.assignmentId!,
    trainingId: assignment?.trainingId ?? "",
    groupIds: assignment?.groupIds ?? [],
  };

  return (
    <TrainingAssignmentForm
      initialValues={initialValues}
      trainings={trainings}
      assignmentStatus={assignmentStatus}
      currentPeriod={currentPeriod}
      onClose={() => navigate(path.to.trainingAssignments)}
    />
  );
}
