import { ValidatedForm } from "@carbon/form";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack
} from "@carbon/react";
import { isToolLifeLow } from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { useFetcher } from "react-router";
import { useAuditLog } from "~/components/AuditLog";
import {
  Boolean,
  Combobox,
  Hidden,
  Number,
  Select,
  Submit,
  TextArea
} from "~/components/Form";
import { usePermissions, useUser } from "~/hooks";
import {
  toolLifeAdjustValidator,
  toolLifePolicyValidator
} from "~/modules/items/items.models";
import type { ToolLifePolicy } from "~/modules/items/tool-life.service";
import { useParts } from "~/stores";
import { path } from "~/utils/path";

type SerialLifeRow = {
  id: string;
  readableId: string | null;
  lifeRemaining: number | null;
  status: string;
};

type LedgerRow = {
  id: string;
  delta: number;
  balanceAfter: number;
  sourceType: string;
  reason: string | null;
  createdAt: string;
  trackedEntityId: string | null;
};

type ToolLifeFormProps = {
  itemId: string;
  policy: ToolLifePolicy;
  serialLife: SerialLifeRow[];
  ledger: LedgerRow[];
};

export default function ToolLifeForm({
  itemId,
  policy,
  serialLife,
  ledger
}: ToolLifeFormProps) {
  const { t } = useLingui();
  const permissions = usePermissions();
  const { company } = useUser();
  const parts = useParts();

  const dedicatedPartOptions = useMemo(() => {
    const seen = new Set<string>();
    return parts
      .filter((part) => {
        if (!part.readableId || seen.has(part.readableId)) return false;
        seen.add(part.readableId);
        return true;
      })
      .map((part) => ({
        value: part.readableId,
        label: part.readableId,
        helper: part.name
      }));
  }, [parts]);
  const policyFetcher = useFetcher();
  const adjustFetcher = useFetcher();
  const adjustModal = useDisclosure();
  const visibleLedger = useMemo(
    () => ledger.filter((row) => row.sourceType !== "AutoIssue"),
    [ledger]
  );
  const isSerial = policy.itemTrackingType === "Serial";
  const canEdit = permissions.can("update", "parts");

  const { trigger: policyHistoryTrigger, drawer: policyHistoryDrawer } =
    useAuditLog({
      entityType: "tool",
      entityId: policy.readableId,
      companyId: company?.id ?? "",
      variant: "card-action",
      triggerLabel: t`Policy History`,
      drawerTitle: t`Tool Life Policy History`
    });

  const lifeUnit =
    policy.lifeBasis === "Cycles"
      ? t`cycles`
      : policy.lifeBasis === "RunTime"
        ? t`hours`
        : "";

  return (
    <Card>
      <ValidatedForm
        method="post"
        action={path.to.toolLife(itemId)}
        validator={toolLifePolicyValidator}
        defaultValues={{
          lifeBasis: policy.lifeBasis ?? "none",
          lifeLimit: policy.lifeLimit ?? undefined,
          isPermanent: policy.isPermanent,
          dedicatedPartReadableId: policy.dedicatedPartReadableId ?? undefined
        }}
        fetcher={policyFetcher}
      >
        <CardHeader>
          <HStack className="justify-between w-full">
            <CardTitle>
              <Trans>Tool Life</Trans>
            </CardTitle>
            <HStack>{policyHistoryTrigger}</HStack>
          </HStack>
        </CardHeader>
        <CardContent>
          <Hidden name="intent" value="policy" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Select
              name="lifeBasis"
              label={t`Life Basis`}
              options={[
                { label: t`Not tracked`, value: "none" },
                { label: t`Cycles`, value: "Cycles" },
                { label: t`Run Time`, value: "RunTime" }
              ]}
            />
            <Number name="lifeLimit" label={t`Life Limit`} />
            <Boolean
              name="isPermanent"
              label={t`Permanent Tool`}
              description={t`Auto-issued on job operations for the dedicated part`}
              bordered
            />
            <Combobox
              name="dedicatedPartReadableId"
              label={t`Dedicated Part`}
              description={t`Required for permanent tools`}
              options={dedicatedPartOptions}
            />
          </div>

          {!isSerial && policy.lifeBasis && (
            <HStack className="mt-4 items-center gap-2">
              <span>
                <Trans>Remaining:</Trans>{" "}
                <strong>
                  {policy.lifeRemaining ?? 0} {lifeUnit}
                </strong>
              </span>
              {isToolLifeLow(policy.lifeRemaining, policy.lifeLimit) && (
                <Badge variant="warning">
                  <Trans>Low life</Trans>
                </Badge>
              )}
              {canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={adjustModal.onOpen}
                >
                  <Trans>Adjust</Trans>
                </Button>
              )}
            </HStack>
          )}

          {isSerial && policy.lifeBasis && serialLife.length > 0 && (
            <Table className="mt-4">
              <Thead>
                <Tr>
                  <Th>
                    <Trans>Serial</Trans>
                  </Th>
                  <Th>
                    <Trans>Status</Trans>
                  </Th>
                  <Th>
                    <Trans>Remaining</Trans>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {serialLife.map((row) => (
                  <Tr key={row.id}>
                    <Td>{row.readableId}</Td>
                    <Td>{row.status}</Td>
                    <Td>
                      <HStack>
                        <span>
                          {row.lifeRemaining ?? 0} {lifeUnit}
                        </span>
                        {isToolLifeLow(row.lifeRemaining, policy.lifeLimit) && (
                          <Badge variant="warning">
                            <Trans>Low</Trans>
                          </Badge>
                        )}
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}

          {visibleLedger.length > 0 && (
            <VStack className="mt-6 gap-2">
              <h4 className="text-sm font-medium">
                <Trans>Life History</Trans>
              </h4>
              <Table>
                <Thead>
                  <Tr>
                    <Th>
                      <Trans>When</Trans>
                    </Th>
                    <Th>
                      <Trans>Source</Trans>
                    </Th>
                    <Th>
                      <Trans>Delta</Trans>
                    </Th>
                    <Th>
                      <Trans>Balance</Trans>
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {visibleLedger.map((row) => (
                    <Tr key={row.id}>
                      <Td>{new Date(row.createdAt).toLocaleString()}</Td>
                      <Td>{row.sourceType}</Td>
                      <Td>{row.delta}</Td>
                      <Td>{row.balanceAfter}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </VStack>
          )}
        </CardContent>
        {canEdit && (
          <CardFooter>
            <Submit isLoading={policyFetcher.state !== "idle"}>
              <Trans>Save Tool Life Policy</Trans>
            </Submit>
          </CardFooter>
        )}
      </ValidatedForm>
      {policyHistoryDrawer}

      {adjustModal.isOpen && (
        <Modal open onOpenChange={adjustModal.onClose}>
          <ModalContent>
            <ValidatedForm
              method="post"
              action={path.to.toolLife(itemId)}
              validator={toolLifeAdjustValidator}
              fetcher={adjustFetcher}
              onSubmit={adjustModal.onClose}
            >
              <ModalHeader>
                <ModalTitle>
                  <Trans>Adjust Tool Life</Trans>
                </ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Hidden name="intent" value="adjust" />
                <VStack className="gap-4">
                  <Number name="newRemaining" label={t`New Remaining`} />
                  <TextArea name="reason" label={t`Reason`} />
                </VStack>
              </ModalBody>
              <ModalFooter>
                <Submit isLoading={adjustFetcher.state !== "idle"}>
                  <Trans>Save Adjustment</Trans>
                </Submit>
              </ModalFooter>
            </ValidatedForm>
          </ModalContent>
        </Modal>
      )}
    </Card>
  );
}
