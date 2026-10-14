// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import {
  assertIsPost,
  CONTROLLED_ENVIRONMENT,
  error,
  success
} from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { flash } from "@carbon/auth/session.server";
import { InviteEmail } from "@carbon/documents/email";
import { getSsoAwareInviteLink } from "@carbon/ee/sso.server";
import { ValidatedForm, validationError, validator } from "@carbon/form";
import { sendEmail } from "@carbon/lib/email.server";
import { useLoaderQuery } from "@carbon/query";
import {
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalTitle,
  useCloseRoute,
  VStack
} from "@carbon/react";
import { getClientIp, redirect } from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { render } from "@react-email/components";
import { nanoid } from "nanoid";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { Input, Select, Submit } from "~/components/Form";
import { promoteBasicEmployeeValidator } from "~/modules/users/users.models";
import { promoteBasicEmployeeToUser } from "~/modules/users/users.server";
import type { getEmployeeTypes } from "~/modules/users/users.service";
import type { Result } from "~/types";
import { path } from "~/utils/path";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { client, companyId } = await requirePermissions(request, {
    update: "users"
  });

  const { personId } = params;
  if (!personId) throw new Error("personId is required");

  const [user, membership] = await Promise.all([
    client
      .from("user")
      .select("id, firstName, lastName, email, isConsoleOperator")
      .eq("id", personId)
      .single(),
    client
      .from("employee")
      .select("id")
      .eq("id", personId)
      .eq("companyId", companyId)
      .maybeSingle()
  ]);

  if (user.error || !user.data || !membership.data) {
    throw redirect(
      path.to.people,
      await flash(request, error(user.error, "Employee not found"))
    );
  }

  if (!user.data.isConsoleOperator) {
    throw redirect(
      path.to.personDetails(personId),
      await flash(request, error(null, "Employee already has a login"))
    );
  }

  return { person: user.data };
}

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    update: "users"
  });

  const { personId } = params;
  if (!personId) throw new Error("personId is required");

  const validation = await validator(promoteBasicEmployeeValidator).validate(
    await request.formData()
  );

  if (validation.error) {
    return validationError(validation.error);
  }

  const result = await promoteBasicEmployeeToUser(client, {
    userId: personId,
    email: validation.data.email,
    employeeType: validation.data.employeeType,
    companyId,
    createdBy: userId
  });

  if (!result.success) {
    throw redirect(
      path.to.personDetails(personId),
      await flash(request, error(result, result.message))
    );
  }

  if (result.code) {
    const location = request.headers.get("x-vercel-ip-city") ?? "Unknown";
    const ip = getClientIp(request) ?? "127.0.0.1";
    const [company, actor, person] = await Promise.all([
      client.from("company").select("name").eq("id", companyId).single(),
      client.from("user").select("email, fullName").eq("id", userId).single(),
      client
        .from("user")
        .select("firstName, lastName")
        .eq("id", personId)
        .single()
    ]);

    if (company.data && actor.data) {
      const inviteLink = await getSsoAwareInviteLink(
        getCarbonServiceRole(),
        result.email,
        result.code,
        companyId
      );
      await sendEmail({
        to: result.email,
        subject: `You have been invited to join ${company.data.name} on Carbon`,
        headers: { "X-Entity-Ref-ID": nanoid() },
        html: await render(
          InviteEmail({
            invitedByEmail: actor.data.email,
            invitedByName: actor.data.fullName ?? "",
            email: result.email,
            name: `${person.data?.firstName ?? ""} ${person.data?.lastName ?? ""}`.trim(),
            companyName: company.data.name,
            inviteLink,
            ip,
            location,
            controlledEnvironment: CONTROLLED_ENVIRONMENT
          })
        )
      });
    }
  }

  throw redirect(
    path.to.personDetails(personId),
    await flash(
      request,
      success("Invite sent. They can log in after accepting the email.")
    )
  );
}

export default function PromoteBasicEmployeeRoute() {
  const { t } = useLingui();
  const { person } = useLoaderData<typeof loader>();
  const closeRoute = useCloseRoute();
  const formFetcher = useFetcher<Result>();
  const employeeTypeFetcher = useLoaderQuery<
    Awaited<ReturnType<typeof getEmployeeTypes>>
  >(path.to.api.employeeTypes);

  const employeeTypeOptions =
    employeeTypeFetcher.data?.data
      ?.filter((et) => et.systemType !== "Console Operator")
      .map((et) => ({
        value: et.id,
        label: et.name
      })) ?? [];

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) closeRoute();
      }}
    >
      <ModalOverlay />
      <ModalContent>
        <ValidatedForm
          method="post"
          validator={promoteBasicEmployeeValidator}
          fetcher={formFetcher}
          className="flex flex-col h-full"
        >
          <ModalHeader>
            <ModalTitle>
              <Trans>Invite to ERP</Trans>
            </ModalTitle>
          </ModalHeader>

          <ModalBody>
            <VStack spacing={4}>
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Invite{" "}
                  <strong>
                    {person.firstName} {person.lastName}
                  </strong>{" "}
                  with an email so they can log into ERP. Existing timeclock PIN
                  (if any) is kept.
                </Trans>
              </p>
              <Input
                name="email"
                label={t`Email Address`}
                placeholder="employee@company.com"
              />
              <Select
                name="employeeType"
                label={t`Employee Type`}
                options={employeeTypeOptions}
                placeholder={t`Select Employee Type`}
              />
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Submit isLoading={formFetcher.state !== "idle"}>
                <Trans>Send invite</Trans>
              </Submit>
            </HStack>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
}
