import { json } from "@remix-run/react";

import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validator } from "@carbon/form";
import type { ActionFunctionArgs } from "@vercel/remix";
import {
  trainingQuestionValidator,
  upsertTrainingQuestion,
} from "~/modules/people";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "people",
  });

  const { id: trainingId } = params;
  if (!trainingId) throw new Error("id is not found");

  const formData = await request.formData();

  // Handle arrays from form data
  const options = formData.getAll("options[]") as string[];
  const correctAnswers = formData.getAll("correctAnswers[]") as string[];

  const validation = await validator(trainingQuestionValidator).validate(
    formData
  );

  if (validation.error) {
    return json(
      { success: false },
      await flash(request, error(validation.error, "Failed to create question"))
    );
  }

  const { id, matchingPairs, correctBoolean, ...data } = validation.data;

  // Parse matchingPairs if it's a string
  let parsedMatchingPairs = null;
  if (matchingPairs) {
    try {
      parsedMatchingPairs = JSON.parse(matchingPairs);
    } catch {
      parsedMatchingPairs = null;
    }
  }

  const create = await upsertTrainingQuestion(client, {
    ...data,
    options: options.length > 0 ? options : data.options,
    correctAnswers: correctAnswers.length > 0 ? correctAnswers : data.correctAnswers,
    matchingPairs: parsedMatchingPairs,
    correctBoolean: correctBoolean === true || correctBoolean === "true",
    companyId,
    createdBy: userId,
  });

  if (create.error) {
    return json(
      {
        success: false,
      },
      await flash(
        request,
        error(create.error, "Failed to insert training question")
      )
    );
  }

  return json({ success: true });
}
