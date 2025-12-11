import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { useNavigate } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@vercel/remix";
import { json, redirect } from "@vercel/remix";
import { trainingValidator, upsertTraining } from "~/modules/people";
import { TrainingForm } from "~/modules/people/ui/Training";
import { path } from "~/utils/path";

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermissions(request, {
    create: "people",
  });

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "people",
  });
  const formData = await request.formData();
  const validation = await validator(trainingValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const { id, content, ...data } = validation.data;

  let contentJSON;
  try {
    contentJSON = content ? JSON.parse(content) : {};
  } catch (e) {
    return json(
      {},
      await flash(
        request,
        error("Invalid training content format", "Failed to parse training content")
      )
    );
  }

  const insertTraining = await upsertTraining(client, {
    ...data,
    content: contentJSON,
    companyId,
    createdBy: userId,
  });

  if (insertTraining.error || !insertTraining.data?.id) {
    return json(
      {},
      await flash(request, error(insertTraining.error, "Failed to create training"))
    );
  }

  return redirect(
    path.to.training(insertTraining.data.id),
    await flash(request, success("Training created"))
  );
}

export default function NewTrainingRoute() {
  const navigate = useNavigate();
  const initialValues = {
    name: "",
  };

  return <TrainingForm initialValues={initialValues} onClose={() => navigate(-1)} />;
}
