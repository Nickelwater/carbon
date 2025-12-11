import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { VStack } from "@carbon/react";
import { Outlet, redirect, useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { getTrainings } from "~/modules/people";
import { TrainingsTable } from "~/modules/people/ui/Training";
import { getTagsList } from "~/modules/shared";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";
import { getGenericQueryFilters } from "~/utils/query";

export const handle: Handle = {
  breadcrumb: "Training",
  to: path.to.trainings,
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    view: "people",
    role: "employee",
  });

  const url = new URL(request.url);
  const searchParams = new URLSearchParams(url.search);
  const search = searchParams.get("search");
  const { limit, offset, sorts, filters } =
    getGenericQueryFilters(searchParams);

  const [trainings, tags] = await Promise.all([
    getTrainings(client, companyId, {
      search,
      limit,
      offset,
      sorts,
      filters,
    }),
    getTagsList(client, companyId, "training"),
  ]);

  if (trainings.error) {
    throw redirect(
      path.to.authenticatedRoot,
      await flash(request, error(trainings.error, "Error loading trainings"))
    );
  }

  if (tags.error) {
    throw redirect(
      path.to.authenticatedRoot,
      await flash(request, error(tags.error, "Error loading tags"))
    );
  }

  return json({
    trainings: trainings.data ?? [],
    count: trainings.count ?? 0,
    tags: tags.data ?? [],
  });
}

export default function TrainingsRoute() {
  const { trainings, count, tags } = useLoaderData<typeof loader>();

  return (
    <VStack spacing={0} className="h-full">
      <TrainingsTable data={trainings} count={count} tags={tags} />
      <Outlet />
    </VStack>
  );
}
