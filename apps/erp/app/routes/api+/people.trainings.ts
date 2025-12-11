import { requirePermissions } from "@carbon/auth/auth.server";
import type { LoaderFunctionArgs } from "@vercel/remix";
import { json } from "@vercel/remix";
import { getOutstandingTrainingsForUser } from "~/modules/people";

export async function loader({ request }: LoaderFunctionArgs) {
  const { client, companyId, userId } = await requirePermissions(request, {});

  return json(await getOutstandingTrainingsForUser(client, companyId, userId));
}
