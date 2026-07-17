import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import invariant from "tiny-invariant";
import { getInProcessInspection } from "~/modules/quality";
import InProcessInspectionDetail from "~/modules/quality/ui/InProcessInspections/InProcessInspectionDetail";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "quality",
    role: "employee"
  });
  const { id } = params;
  invariant(id, "id is required");

  const result = await getInProcessInspection(client, id, companyId);

  if (result.error || !result.data) {
    throw redirect(
      path.to.inProcessInspections,
      await flash(
        request,
        error(result.error, "Failed to load in-process inspection")
      )
    );
  }

  return { inspection: result.data };
}

export default function InProcessInspectionRoute() {
  const { inspection } = useLoaderData<typeof loader>();
  return <InProcessInspectionDetail inspection={inspection as any} />;
}
