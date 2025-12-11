import { error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "@vercel/remix";
import { json, redirect } from "@vercel/remix";
import { deleteTraining } from "~/modules/people";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  const { client } = await requirePermissions(request, {
    delete: "people",
  });

  const { id } = params;

  if (!id) throw new Error("id is not found");

  const mutation = await deleteTraining(client, id);
  if (mutation.error) {
    return json(
      {
        success: false,
      },
      await flash(request, error(mutation.error, "Failed to delete training"))
    );
  }

  throw redirect(
    path.to.trainings,
    await flash(request, success("Successfully deleted training"))
  );
}
