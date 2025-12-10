import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import { Outlet, useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@vercel/remix";
import { json, redirect } from "@vercel/remix";
import { getRisks } from "~/modules/quality/quality.service";
import RiskRegistersTable from "~/modules/quality/ui/RiskRegister/RiskRegistersTable";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";
import { getGenericQueryFilters } from "~/utils/query";
import type { Risk } from "~/modules/quality/types";

export const handle: Handle = {
  breadcrumb: "Risks",
  to: path.to.risks,
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "quality",
    role: "employee",
  });

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const search = searchParams.get("search");
  const { limit, offset, sorts, filters } =
    getGenericQueryFilters(searchParams);

  const risks = await getRisks(client, companyId, {
    search,
    limit,
    offset,
    sorts,
    filters,
  });

  if (risks.error) {
    redirect(
      path.to.quality,
      await flash(
        request,
        error(risks.error, "Failed to fetch risks")
      )
    );
  }

  return json({
    count: risks.count ?? 0,
    risks: (risks.data ?? []) as unknown as Risk[],
  });
}

export default function RisksRoute() {
  const { count, risks } = useLoaderData<typeof loader>();

  return (
    <VStack spacing={0} className="h-full">
      <RiskRegistersTable
        data={risks}
        count={count}
      />
      <Outlet />
    </VStack>
  );
}
