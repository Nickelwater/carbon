// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import { ValidatedForm } from "@carbon/form";
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
import { Trans, useLingui } from "@lingui/react/macro";
import { useFetcher } from "react-router";
import { Hidden, Input, Location, Select, Submit } from "~/components/Form";
import { useUser } from "~/hooks";
import { usePlanGate } from "~/hooks/usePlanGate";
import type { getEmployeeTypes } from "~/modules/users";
import { createBasicEmployeeValidator } from "~/modules/users";
import type { Result } from "~/types";
import { path } from "~/utils/path";

const CreateBasicEmployeeModal = () => {
  const { t } = useLingui();
  const { defaults } = useUser();
  const { isGated: permissionsGated } = usePlanGate({ feature: "PERMISSIONS" });
  const closeRoute = useCloseRoute();
  const formFetcher = useFetcher<Result>();
  const employeeTypeFetcher = useLoaderQuery<
    Awaited<ReturnType<typeof getEmployeeTypes>>
  >(path.to.api.employeeTypes);

  const employeeTypes = employeeTypeFetcher.data?.data ?? [];
  const employeeTypeOptions = employeeTypes
    .filter((et) => et.systemType !== "Console Operator")
    .map((et) => ({
      value: et.id,
      label: et.name
    }));

  const adminType =
    employeeTypes.find((et) => et.systemType === "Admin") ??
    employeeTypes.find((et) => et.protected) ??
    employeeTypes[0];

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
          action={path.to.newBasicEmployee}
          validator={createBasicEmployeeValidator}
          defaultValues={{
            locationId: defaults?.locationId ?? undefined
          }}
          fetcher={formFetcher}
          className="flex flex-col h-full"
        >
          <ModalHeader>
            <ModalTitle>
              <Trans>Add employee without email</Trans>
            </ModalTitle>
          </ModalHeader>

          <ModalBody>
            <VStack spacing={4}>
              <p className="text-sm text-muted-foreground">
                <Trans>
                  Creates an active employee for timecards and shop floor use.
                  They cannot log into ERP until you invite them with an email.
                </Trans>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                <Input name="firstName" label={t`First Name`} />
                <Input name="lastName" label={t`Last Name`} />
              </div>
              {permissionsGated ? (
                <Hidden name="employeeType" value={adminType?.id ?? ""} />
              ) : (
                <Select
                  name="employeeType"
                  label={t`Employee Type`}
                  options={employeeTypeOptions}
                  placeholder={t`Select Employee Type`}
                />
              )}
              <Location name="locationId" label={t`Location`} />
              <Input name="enrollId" label={t`Clock enroll ID`} />
              <p className="text-xs text-muted-foreground -mt-2">
                <Trans>
                  Optional. Matches the enroll ID programmed on the timeclock.
                </Trans>
              </p>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Submit
                isLoading={formFetcher.state !== "idle"}
                isDisabled={permissionsGated && !adminType}
              >
                <Trans>Add employee</Trans>
              </Submit>
            </HStack>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
};

export default CreateBasicEmployeeModal;
