import { requirePermissions } from "@carbon/auth/auth.server";
import { type ActionFunctionArgs, json, redirect } from "@vercel/remix";
import invariant from "tiny-invariant";
import { deleteRisk } from "~/modules/quality/quality.service";
import { path } from "~/utils/path";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { client } = await requirePermissions(request, {
    delete: "quality",
    role: "employee",
  });
  const { id } = params;
  invariant(id, "id is required");

  const result = await deleteRisk(client, id);

  if (result.error) {
    return json(
      {
        error: result.error,
      },
      { status: 500 }
    );
  }

  return redirect(path.to.risks);
};
