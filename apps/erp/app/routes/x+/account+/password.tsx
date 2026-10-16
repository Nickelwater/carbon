// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { assertIsPost, error, success } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import { redirect } from "@carbon/utils";
import { msg } from "@lingui/core/macro";
import type { ActionFunctionArgs } from "react-router";
import { data } from "react-router";
import { accountPasswordValidator } from "~/modules/account";
import { PasswordForm } from "~/modules/account/ui/Password";
import type { Handle } from "~/utils/handle";
import { path } from "~/utils/path";

export const handle: Handle = {
  breadcrumb: msg`Password`,
  to: path.to.accountPassword
};

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { email, sessionUserId } = await requirePermissions(request, {});

  const validation = await validator(accountPasswordValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const { currentPassword, password } = validation.data;
  const serviceRole = getCarbonServiceRole();

  const confirmPassword = await serviceRole.auth.signInWithPassword({
    email,
    password: currentPassword
  });

  if (confirmPassword.error || !confirmPassword.data.user) {
    return data(
      {},
      await flash(request, error(null, "Current password is invalid"))
    );
  }

  const updatePassword = await serviceRole.auth.admin.updateUserById(
    sessionUserId,
    { password }
  );

  if (updatePassword.error) {
    return data(
      {},
      await flash(
        request,
        error(updatePassword.error, "Failed to update password")
      )
    );
  }

  throw redirect(
    path.to.accountPassword,
    await flash(request, success("Updated password"))
  );
}

export default function AccountPassword() {
  return <PasswordForm />;
}
