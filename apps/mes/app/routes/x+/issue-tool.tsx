import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { issueJobOperationTool } from "~/services/tool-life.service";

const issueToolValidator = z.object({
  jobOperationToolId: z.string().min(1),
  trackedEntityId: zfd.text(z.string().optional()),
  jobOperationId: z.string().min(1)
});

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { userId } = await requirePermissions(request, {});

  const formData = await request.formData();
  const validation = await validator(issueToolValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  const serviceRole = await getCarbonServiceRole();
  const result = await issueJobOperationTool(
    serviceRole,
    validation.data.jobOperationToolId,
    validation.data.trackedEntityId ?? null,
    userId
  );

  if (result.error) {
    return data(
      {},
      await flash(request, error(result.error, "Failed to issue tool"))
    );
  }

  return data({}, await flash(request, success("Tool issued successfully")));
}
