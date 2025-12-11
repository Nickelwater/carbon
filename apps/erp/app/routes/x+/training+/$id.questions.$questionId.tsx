import { json } from "@remix-run/react";

import { assertIsPost, error, notFound } from "@carbon/auth";
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
  const { client, userId } = await requirePermissions(request, {
    update: "people",
  });

  const { questionId } = params;
  if (!questionId) throw notFound("question id is not found");

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
      await flash(request, error(validation.error, "Failed to update question"))
    );
  }

  const { matchingPairs, correctBoolean, ...data } = validation.data;

  // Parse matchingPairs if it's a string
  let parsedMatchingPairs = null;
  if (matchingPairs) {
    try {
      parsedMatchingPairs = JSON.parse(matchingPairs);
    } catch {
      parsedMatchingPairs = null;
    }
  }

  const update = await upsertTrainingQuestion(client, {
    id: questionId,
    ...data,
    options: options.length > 0 ? options : data.options,
    correctAnswers: correctAnswers.length > 0 ? correctAnswers : data.correctAnswers,
    matchingPairs: parsedMatchingPairs,
    correctBoolean: correctBoolean === true || correctBoolean === "true",
    updatedBy: userId,
  });

  if (update.error) {
    return json(
      { success: false },
      await flash(
        request,
        error(update.error, "Failed to update training question")
      )
    );
  }

  return json({ success: true });
}
