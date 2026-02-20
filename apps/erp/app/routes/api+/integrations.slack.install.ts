import { requirePermissions } from "@carbon/auth/auth.server";
import { getSlackInstallUrl } from "@carbon/ee/slack.server";
import type { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
  const { userId, companyId } = await requirePermissions(request, {});

  const url = await getSlackInstallUrl({
    companyId,
    userId
  });

  return { url };
}
