import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { deleteTrainingQuestion } from "~/modules/people";

export async function action({ request, params }: ActionFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    delete: "people",
  });

  const { questionId } = params;

  if (!questionId) throw new Error("questionId is not found");

  const deleteQuestion = await deleteTrainingQuestion(
    client,
    questionId,
    companyId
  );

  if (deleteQuestion.error) {
    return json(
      {
        success: false,
      },
      await flash(
        request,
        error(deleteQuestion.error, "Failed to delete question")
      )
    );
  }

  return json(
    {
      success: true,
    },
    await flash(request, success("Successfully deleted question"))
  );
}
