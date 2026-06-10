import { error } from "@carbon/auth";

import { requirePermissions } from "@carbon/auth/auth.server";

import { getCarbonServiceRole } from "@carbon/auth/client.server";

import { flash } from "@carbon/auth/session.server";

import type { LoaderFunctionArgs } from "react-router";

import { redirect, useLoaderData } from "react-router";

import { OperationTools } from "~/components/JobOperation/OperationTools";

import {
  getJobByOperationId,
  getJobOperationById
} from "~/services/operations.service";

import { getJobOperationToolsWithLife } from "~/services/tool-life.service";
import type { OperationWithDetails } from "~/services/types";
import { makeDurations } from "~/utils/durations";

import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { companyId } = await requirePermissions(request, {});

  const { operationId } = params;

  if (!operationId) throw new Error("Operation ID is required");

  const serviceRole = await getCarbonServiceRole();

  const [job, operation, operationTools] = await Promise.all([
    getJobByOperationId(serviceRole, operationId),

    getJobOperationById(serviceRole, operationId),

    getJobOperationToolsWithLife(serviceRole, operationId)
  ]);

  if (job.error || !job.data) {
    throw redirect(
      path.to.operations,

      await flash(request, error(job.error, "Failed to fetch job"))
    );
  }

  if (operation.error || !operation.data?.[0]) {
    throw redirect(
      path.to.operations,

      await flash(request, error(operation.error, "Failed to fetch operation"))
    );
  }

  if (job.data.companyId !== companyId) {
    throw redirect(
      path.to.operations,

      await flash(request, error("Unauthorized", "Unauthorized"))
    );
  }

  return {
    job: job.data,

    operation: makeDurations(operation.data[0]) as OperationWithDetails,

    tools: operationTools.data ?? []
  };
}

export default function OperationToolsRoute() {
  const { job, operation, tools } = useLoaderData<typeof loader>();

  return <OperationTools operation={operation} job={job} tools={tools} />;
}
