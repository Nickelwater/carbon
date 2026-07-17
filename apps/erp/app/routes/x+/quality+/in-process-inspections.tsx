import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import { msg } from "@lingui/core/macro";
import type { LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData } from "react-router";
import { getInProcessInspections } from "~/modules/quality";
import InProcessInspectionsTable from "~/modules/quality/ui/InProcessInspections/InProcessInspectionsTable";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";
import { getGenericQueryFilters } from "~/utils/query";

export const handle: Handle = {
  breadcrumb: msg`In-Process Inspections`,
  to: path.to.inProcessInspections
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "quality",
    role: "employee"
  });

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const search = searchParams.get("search");
  const status = searchParams.get("status");
  const { limit, offset, sorts, filters } =
    getGenericQueryFilters(searchParams);

  const inspections = await getInProcessInspections(client, companyId, {
    search,
    status,
    limit,
    offset,
    sorts,
    filters
  });

  if (inspections.error) {
    throw redirect(
      path.to.quality,
      await flash(
        request,
        error(inspections.error, "Failed to load in-process inspections")
      )
    );
  }

  return {
    inspections: inspections.data ?? [],
    count: inspections.count ?? 0
  };
}

export default function InProcessInspectionsRoute() {
  const { inspections, count } = useLoaderData<typeof loader>();

  return (
    <VStack spacing={0} className="h-full">
      <InProcessInspectionsTable data={inspections} count={count} />
      <Outlet />
    </VStack>
  );
}
