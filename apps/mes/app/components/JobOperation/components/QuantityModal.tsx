import {
  Hidden,
  NumberControlled,
  TextArea,
  ValidatedForm
} from "@carbon/form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  VStack
} from "@carbon/react";
import {
  cyclesFromParts,
  cyclesToParts,
  normalizePartsPerCycle,
  remainingCycles,
  targetCycles,
  usesCycleQuantity
} from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useRef, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { useFetcher } from "react-router";
import {
  finishValidator,
  nonScrapQuantityValidator,
  scrapQuantityValidator
} from "~/services/models";
import type {
  JobMaterial,
  OperationWithDetails,
  ProductionEvent,
  ProductionQuantity
} from "~/services/types";
import { path } from "~/utils/path";
import ScrapReason from "./ScrapReason";

export function QuantityModal({
  allStepsRecorded = true,
  laborProductionEvent,
  machineProductionEvent,
  materials = [],
  operation,
  parentIsSerial = false,
  parentIsBatch = false,
  setupProductionEvent,
  trackedEntityId,
  type,
  onClose
}: {
  allStepsRecorded?: boolean;
  laborProductionEvent: ProductionEvent | undefined;
  machineProductionEvent: ProductionEvent | undefined;
  materials?: JobMaterial[];
  operation: OperationWithDetails;
  parentIsSerial?: boolean;
  parentIsBatch?: boolean;
  setupProductionEvent: ProductionEvent | undefined;
  trackedEntityId: string;
  type: "scrap" | "rework" | "complete" | "finish";
  onClose: () => void;
}) {
  const { t } = useLingui();
  const fetcher = useFetcher<ProductionQuantity>();
  const [quantity, setQuantity] = useState(parentIsSerial ? 1 : 0);
  const [confirmedUnissued, setConfirmedUnissued] = useState(false);
  const submitted = useRef(false);
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (submitted.current && fetcher.state === "idle") {
      onClose();
    }
  }, [fetcher.state, onClose]);

  const partsPerCycle = normalizePartsPerCycle(
    // @ts-expect-error partsPerCycle added via migration
    operation.partsPerCycle
  );
  const trackCycles =
    (type === "complete" || type === "scrap") &&
    usesCycleQuantity(
      partsPerCycle,
      // @ts-expect-error timeBasis added via migration
      operation.timeBasis
    ) &&
    !parentIsSerial;

  const requiredParts =
    operation.operationQuantity ?? operation.targetQuantity ?? 0;
  const targetCycleCount = targetCycles(requiredParts, partsPerCycle);
  const completedCycleCount = cyclesFromParts(
    operation.quantityComplete ?? 0,
    partsPerCycle
  );

  const titleMap = {
    scrap: t`Log scrap for ${operation.itemReadableId}`,
    rework: t`Log rework for ${operation.itemReadableId}`,
    complete: t`Log completed for ${operation.itemReadableId}`,
    finish: t`Finish ${operation.itemReadableId}`
  };

  const isOperationComplete = trackCycles
    ? completedCycleCount >= targetCycleCount
    : (operation.quantityComplete ?? 0) >= requiredParts;

  const descriptionMap = {
    scrap: trackCycles
      ? t`Select how many cycles to log as scrap`
      : t`Select a scrap quantity and reason`,
    rework: t`Select a rework quantity`,
    complete: trackCycles
      ? t`Select how many cycles to log as complete`
      : t`Select a completion quantity`,
    finish: t`Are you sure you want to finish this operation? This will end all active production events for this operation.`
  };

  const actionMap = {
    scrap: path.to.scrap,
    rework: path.to.rework,
    complete: path.to.complete,
    finish: path.to.finish
  };

  const actionButtonMap = {
    scrap: t`Log Scrap`,
    rework: t`Log Rework`,
    complete: t`Log Completed`,
    finish: isOperationComplete ? t`Finish` : t`Finish Anyways`
  };

  const validatorMap = {
    scrap: scrapQuantityValidator,
    rework: nonScrapQuantityValidator,
    complete: nonScrapQuantityValidator,
    finish: finishValidator
  };

  const partsFromEnteredQuantity = trackCycles
    ? cyclesToParts(quantity, partsPerCycle)
    : quantity;

  const hasUnissuedTrackedMaterials = useMemo(() => {
    const totalPartsAfterCompletion = parentIsSerial
      ? 1
      : (operation.quantityComplete ?? 0) + partsFromEnteredQuantity;

    return materials.some(
      (material) =>
        (material.requiresSerialTracking || material.requiresBatchTracking) &&
        material.jobOperationId === operation.id &&
        (material?.quantityIssued ?? 0) <
          (material?.quantity ?? 0) * totalPartsAfterCompletion
    );
  }, [
    materials,
    operation.id,
    operation.quantityComplete,
    partsFromEnteredQuantity,
    parentIsSerial
  ]);

  const totalAfterEntry = trackCycles
    ? completedCycleCount +
      quantity +
      (type === "rework"
        ? cyclesFromParts(operation.quantityReworked ?? 0, partsPerCycle)
        : 0)
    : quantity +
      (type === "rework"
        ? (operation.quantityReworked ?? 0)
        : (operation.quantityComplete ?? 0));

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent>
        <ValidatedForm
          action={actionMap[type]}
          method="post"
          validator={validatorMap[type]}
          defaultValues={{
            // @ts-ignore
            trackedEntityId:
              parentIsSerial || parentIsBatch ? trackedEntityId : undefined,
            jobOperationId: operation.id,
            // @ts-ignore
            quantity: type === "finish" ? undefined : 0,
            setupProductionEventId: setupProductionEvent?.id,
            laborProductionEventId: laborProductionEvent?.id,
            machineProductionEventId: machineProductionEvent?.id
          }}
          fetcher={fetcher}
          onSubmit={() => {
            submitted.current = true;
          }}
        >
          <ModalHeader>
            <ModalTitle>{titleMap[type]}</ModalTitle>
            <ModalDescription>{descriptionMap[type]}</ModalDescription>
          </ModalHeader>
          <ModalBody>
            <Hidden name="trackedEntityId" />
            <Hidden
              name="trackingType"
              value={
                parentIsSerial ? "Serial" : parentIsBatch ? "Batch" : undefined
              }
            />
            <Hidden name="jobOperationId" />
            <Hidden name="setupProductionEventId" />
            <Hidden name="laborProductionEventId" />
            <Hidden name="machineProductionEventId" />
            {trackCycles && <Hidden name="quantityUnit" value="cycles" />}
            <VStack spacing={2}>
              {trackCycles && type === "complete" && (
                <p className="text-sm text-muted-foreground">
                  <Trans>
                    {partsPerCycle} parts per cycle · {targetCycleCount} cycles
                    required for {requiredParts} parts
                  </Trans>
                </p>
              )}

              {hasUnissuedTrackedMaterials && type === "complete" && (
                <Alert variant="destructive">
                  <LuTriangleAlert className="h-4 w-4" />
                  <AlertTitle>
                    <Trans>Unissued serial/batch materials</Trans>
                  </AlertTitle>
                  <AlertDescription>
                    <Trans>
                      There are serial or batch tracked materials on the bill of
                      material that have not been fully issued. Completing
                      without issuing may result in incorrect traceability
                      records.
                    </Trans>
                  </AlertDescription>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <Checkbox
                      isChecked={confirmedUnissued}
                      onCheckedChange={(checked) =>
                        setConfirmedUnissued(checked === true)
                      }
                      className="bg-primary"
                    />
                    <span className="text-sm">
                      <Trans>
                        I understand and want to complete without issuing
                      </Trans>
                    </span>
                  </label>
                </Alert>
              )}

              {type === "finish" && !isOperationComplete && (
                <Alert variant="destructive">
                  <LuTriangleAlert className="h-4 w-4" />
                  <AlertTitle>
                    <Trans>Insufficient quantity</Trans>
                  </AlertTitle>
                  <AlertDescription>
                    {trackCycles ? (
                      <Trans>
                        The completed cycles for this operation are less than
                        the required {targetCycleCount} cycles.
                      </Trans>
                    ) : (
                      <Trans>
                        The completed quantity for this operation is less than
                        the required quantity of {requiredParts}.
                      </Trans>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              {type === "finish" && !allStepsRecorded && (
                <Alert variant="destructive">
                  <LuTriangleAlert className="h-4 w-4" />
                  <AlertTitle>
                    <Trans>Steps are missing</Trans>
                  </AlertTitle>
                  <AlertDescription>
                    <Trans>
                      Please record all steps for this operation before closing.
                    </Trans>
                  </AlertDescription>
                </Alert>
              )}
              {type !== "finish" && (
                <div className="flex items-end gap-2 w-full">
                  <div className="flex-grow">
                    <NumberControlled
                      name="quantity"
                      label={trackCycles ? t`Cycles` : t`Quantity`}
                      value={quantity}
                      onChange={setQuantity}
                      isReadOnly={parentIsSerial}
                      minValue={0}
                      size="lg"
                    />
                  </div>
                  {type === "complete" && !parentIsSerial && (
                    <Button
                      variant="secondary"
                      size="lg"
                      className="h-12"
                      onClick={() =>
                        setQuantity(
                          trackCycles
                            ? remainingCycles({
                                targetParts: requiredParts,
                                partsComplete: operation.quantityComplete ?? 0,
                                partsReworked: operation.quantityReworked ?? 0,
                                partsPerCycle
                              })
                            : requiredParts -
                                (operation.quantityComplete ?? 0) -
                                (operation.quantityReworked ?? 0)
                        )
                      }
                    >
                      <Trans>Complete All</Trans>
                    </Button>
                  )}
                </div>
              )}
              {type === "scrap" ? (
                <>
                  <ScrapReason
                    name="scrapReasonId"
                    label={t`Scrap Reason`}
                    size="lg"
                  />
                  <TextArea label={t`Notes`} name="notes" size="lg" />
                </>
              ) : (
                <>
                  <NumberControlled
                    name="totalQuantity"
                    label={trackCycles ? t`Total Cycles` : t`Total Quantity`}
                    size="lg"
                    value={totalAfterEntry}
                    isReadOnly
                  />
                  {trackCycles && type === "complete" && (
                    <NumberControlled
                      name="totalPartsPreview"
                      label={t`Total Parts`}
                      size="lg"
                      value={cyclesToParts(totalAfterEntry, partsPerCycle)}
                      isReadOnly
                    />
                  )}
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" size="lg" onClick={onClose}>
              <Trans>Cancel</Trans>
            </Button>

            <Button
              size="lg"
              variant={
                type === "scrap" || (!isOperationComplete && type === "finish")
                  ? "destructive"
                  : "primary"
              }
              type="submit"
              isLoading={isSubmitting}
              disabled={
                isSubmitting ||
                (type === "complete" &&
                  hasUnissuedTrackedMaterials &&
                  !confirmedUnissued)
              }
            >
              {actionButtonMap[type]}
            </Button>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
}
