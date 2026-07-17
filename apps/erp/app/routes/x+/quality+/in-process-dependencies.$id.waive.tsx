import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import invariant from "tiny-invariant";
import { waiveInspectionDependency } from "~/modules/quality/quality.server";
import { getParams, path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {
    update: "quality",
    role: "employee"
  });
  const { id } = params;
  invariant(id, "id is required");

  const formData = await request.formData();
  const reason = String(formData.get("reason") ?? "");
  const redirectTo =
    String(formData.get("redirectTo") ?? "") || path.to.inProcessInspections;

  const result = await waiveInspectionDependency({
    dependencyId: id,
    reason,
    companyId,
    userId
  });

  if (result.error) {
    throw redirect(
      `${redirectTo}?${getParams(request)}`,
      await flash(request, error(result.error, "Failed to waive dependency"))
    );
  }

  throw redirect(
    `${redirectTo}?${getParams(request)}`,
    await flash(request, success("Dependency waived"))
  );
}
