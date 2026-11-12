// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { companyHasFeature } from "@carbon/ee/plan.server";
import { validationError, validator } from "@carbon/form";
import { getLogger } from "@carbon/logger";
import { updateSubscriptionQuantityForCompany } from "@carbon/stripe/stripe.server";
import { redirect } from "@carbon/utils";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { CreateBasicEmployeeModal } from "~/modules/users";
import { createBasicEmployeeValidator } from "~/modules/users/users.models";
import { createBasicEmployee } from "~/modules/users/users.server";
import { path } from "~/utils/path";

const logger = getLogger("erp", "employees-new-basic");

export async function loader({ request }: LoaderFunctionArgs) {
  await requirePermissions(request, { create: "users" });
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "users"
  });

  const validation = await validator(createBasicEmployeeValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { firstName, lastName, locationId, employeeType, enrollId } =
    validation.data;

  let effectiveEmployeeType = employeeType;
  const canAuthorRoles = await companyHasFeature(client, companyId, {
    feature: "PERMISSIONS"
  });
  if (!canAuthorRoles) {
    const adminType = await client
      .from("employeeType")
      .select("id")
      .eq("companyId", companyId)
      .eq("systemType", "Admin")
      .maybeSingle();
    if (adminType.data?.id) {
      effectiveEmployeeType = adminType.data.id;
    }
  }

  const result = await createBasicEmployee(client, {
    firstName,
    lastName,
    employeeType: effectiveEmployeeType,
    locationId,
    companyId,
    createdBy: userId,
    enrollId
  });

  if (!result.success) {
    logger.error(result);
    throw redirect(
      path.to.people,
      await flash(
        request,
        error(result, result.message ?? "Failed to create employee")
      )
    );
  }

  await updateSubscriptionQuantityForCompany(companyId);

  throw redirect(
    path.to.personJob(result.userId),
    await flash(request, success("Employee added"))
  );
}

export default function () {
  return <CreateBasicEmployeeModal />;
}
