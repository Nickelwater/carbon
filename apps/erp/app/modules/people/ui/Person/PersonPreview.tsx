// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import {
  Badge,
  Button,
  Card,
  CardAttribute,
  CardAttributeLabel,
  CardAttributes,
  CardAttributeValue,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  HStack,
  useDisclosure
} from "@carbon/react";
import { Trans } from "@lingui/react/macro";
import { Link, useParams } from "react-router";
import { Avatar, DateTime } from "~/components";
import { AuditLogDrawer } from "~/components/AuditLog";
import { Enumerable } from "~/components/Enumerable";
import { usePermissions, useRouteData, useUser } from "~/hooks";
import { path } from "~/utils/path";
import type { EmployeeSummary } from "../../types";

const PersonHeader = () => {
  const { personId } = useParams();
  if (!personId) throw new Error("personId not found");

  const { company } = useUser();
  const permissions = usePermissions();
  const auditDrawer = useDisclosure();
  const routeData = useRouteData<{
    employeeSummary: EmployeeSummary;
    isNoLoginEmployee?: boolean;
  }>(path.to.person(personId));

  return (
    <>
      <Card>
        <HStack className="justify-between items-center p-6 pl-0">
          <CardHeader className="pt-0">
            <HStack className="items-center gap-2">
              <CardTitle className="font-headline text-2xl">
                {routeData?.employeeSummary?.name}
              </CardTitle>
              {routeData?.isNoLoginEmployee ? (
                <Badge variant="secondary">
                  <Trans>No login</Trans>
                </Badge>
              ) : null}
            </HStack>
            <CardDescription>
              {routeData?.employeeSummary?.title}
            </CardDescription>
            {routeData?.isNoLoginEmployee &&
            permissions.can("update", "users") ? (
              <div className="pt-2">
                <Button variant="secondary" asChild>
                  <Link to={path.to.promoteBasicEmployee(personId)}>
                    <Trans>Invite to ERP</Trans>
                  </Link>
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <Avatar
            size="lg"
            name={routeData?.employeeSummary?.name ?? undefined}
            path={routeData?.employeeSummary?.avatarUrl}
          />
        </HStack>
        <CardContent>
          <CardAttributes>
            <CardAttribute>
              <CardAttributeLabel>
                <Trans>Department</Trans>
              </CardAttributeLabel>
              <CardAttributeValue>
                {routeData?.employeeSummary?.departmentName}
              </CardAttributeValue>
            </CardAttribute>
            <CardAttribute>
              <CardAttributeLabel>
                <Trans>Location</Trans>
              </CardAttributeLabel>
              <CardAttributeValue>
                <Enumerable
                  value={routeData?.employeeSummary?.locationName ?? null}
                />
              </CardAttributeValue>
            </CardAttribute>
            <CardAttribute>
              <CardAttributeLabel>
                <Trans>Manager</Trans>
              </CardAttributeLabel>
              <CardAttributeValue>
                {routeData?.employeeSummary?.managerName}
              </CardAttributeValue>
            </CardAttribute>
            <CardAttribute>
              <CardAttributeLabel>
                <Trans>Start Date</Trans>
              </CardAttributeLabel>
              <CardAttributeValue>
                <DateTime
                  value={routeData?.employeeSummary?.startDate}
                  variant="date"
                />
              </CardAttributeValue>
            </CardAttribute>
          </CardAttributes>
        </CardContent>
      </Card>
      <AuditLogDrawer
        isOpen={auditDrawer.isOpen}
        onClose={auditDrawer.onClose}
        entityType="employee"
        entityId={personId}
        companyId={company.id}
      />
    </>
  );
};

export default PersonHeader;
