import { useCarbon } from "@carbon/auth";
import { Hidden, Submit, ValidatedForm } from "@carbon/form";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { useUser } from "~/hooks";
import type { JobOperationToolWithLife } from "~/services/tool-life.service";
import { path } from "~/utils/path";

const issueToolValidator = z.object({
  jobOperationToolId: z.string().min(1),
  jobOperationId: z.string().min(1),
  trackedEntityId: zfd.text(z.string().optional())
});

export function IssueToolModal({
  operationId,
  tool,
  onClose
}: {
  operationId: string;
  tool: JobOperationToolWithLife;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const fetcher = useFetcher();
  const { carbon } = useCarbon();
  const { company } = useUser();
  const [serialOptions, setSerialOptions] = useState<
    Array<{ id: string; readableId: string | null }>
  >([]);

  useEffect(() => {
    if (
      tool.itemTrackingType !== "Serial" ||
      !carbon ||
      !tool.toolReadableId ||
      !company?.id
    ) {
      return;
    }

    (async () => {
      const items = await carbon
        .from("item")
        .select("id")
        .eq("readableId", tool.toolReadableId!)
        .eq("companyId", company.id);

      const itemIds = items.data?.map((row) => row.id) ?? [];
      if (itemIds.length === 0) {
        setSerialOptions([]);
        return;
      }

      const serials = await carbon
        .from("trackedEntity")
        .select("id, readableId")
        .in("itemId", itemIds)
        .eq("companyId", company.id)
        .in("status", ["Available", "Reserved"]);

      setSerialOptions(serials.data ?? []);
    })();
  }, [carbon, company?.id, tool.itemTrackingType, tool.toolReadableId]);

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ValidatedForm
          method="post"
          action={path.to.issueTool}
          validator={issueToolValidator}
          fetcher={fetcher}
          onSubmit={onClose}
        >
          <ModalHeader>
            <ModalTitle>
              <Trans>Issue Tool {tool.toolReadableId}</Trans>
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Hidden name="jobOperationToolId" value={tool.id} />
            <Hidden name="jobOperationId" value={operationId} />
            <VStack className="gap-3">
              {tool.itemTrackingType === "Serial" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span>
                    <Trans>Serial</Trans>
                  </span>
                  <select
                    name="trackedEntityId"
                    className="border rounded px-2 py-1"
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t`Select serial`}
                    </option>
                    {serialOptions.map((serial) => (
                      <option key={serial.id} value={serial.id}>
                        {serial.readableId}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Submit isLoading={fetcher.state !== "idle"}>
              <Trans>Issue Tool</Trans>
            </Submit>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
}
