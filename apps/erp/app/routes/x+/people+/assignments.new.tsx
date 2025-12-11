import { validationError, validator } from "@carbon/form";
import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { NotificationEvent } from "@carbon/notifications";
import { redirect, useLoaderData, useNavigate } from "@remix-run/react";
import { tasks } from "@trigger.dev/sdk";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import {
  getTrainingsList,
  trainingAssignmentValidator,
  upsertTrainingAssignment,
} from "~/modules/people";
import type { TrainingListItem } from "~/modules/people/types";
import TrainingAssignmentForm from "~/modules/people/ui/Training/TrainingAssignmentForm";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const handle: Handle = {
  breadcrumb: "New Assignment",
  to: path.to.newTrainingAssignment,
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    create: "people",
    role: "employee",
  });

  const trainings = await getTrainingsList(client, companyId);

  if (trainings.error) {
    throw redirect(
      path.to.trainingAssignments,
      await flash(request, error(trainings.error, "Error loading trainings"))
    );
  }

  return json({
    trainings: (trainings.data ?? []) as TrainingListItem[],
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "people",
    role: "employee",
  });

  const formData = await request.formData();
  const validation = await validator(trainingAssignmentValidator).validate(
    formData
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { trainingId, groupIds } = validation.data;

  const result = await upsertTrainingAssignment(client, {
    trainingId,
    groupIds,
    companyId,
    createdBy: userId,
  });

  if (result.error) {
    return json(
      { error: result.error.message },
      {
        status: 500,
        headers: await flash(
          request,
          error(result.error, "Failed to create assignment")
        ),
      }
    );
  }

  // Send notifications to all users in the assigned groups
  if (result.data?.id) {
    try {
      await tasks.trigger("notify", {
        companyId,
        documentId: result.data.id,
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
  }

  throw redirect(
    path.to.trainingAssignments,
    await flash(request, success("Assignment created successfully"))
  );
}

export default function NewTrainingAssignmentRoute() {
  const { trainings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const initialValues = {
    id: undefined,
    trainingId: "",
    groupIds: [] as string[],
  };

  return (
    <TrainingAssignmentForm
      initialValues={initialValues}
      trainings={trainings}
      onClose={() => navigate(path.to.trainingAssignments)}
    />
  );
}
