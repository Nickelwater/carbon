import { ValidatedForm } from "@carbon/form";
import {
  Badge,
  BarProgress,
  Button,
  Checkbox,
  ClientOnly,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ScrollArea,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  VStack
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  LuCheck,
  LuCircleCheck,
  LuCircleX,
  LuList,
  LuQrCode,
  LuX
} from "react-icons/lu";
import { useFetcher } from "react-router";
import { Hidden, Submit, TextArea } from "~/components/Form";
import {
  computeSampleAutoStatus,
  evaluateCharacteristicMeasurement
} from "~/modules/quality/evaluateCharacteristicMeasurement";
import { inboundInspectionSampleValidator } from "~/modules/quality/quality.models";
import type {
  InspectionPlanRow,
  InspectionTrackedEntity
} from "~/modules/quality/types";
import { path } from "~/utils/path";

const InspectionDocumentViewer = lazy(
  () =>
    import("~/modules/quality/ui/InspectionDocument/InspectionDocumentViewer")
);

type Props = {
  inspectionId: string;
  isSerial: boolean;
  remaining: InspectionTrackedEntity[];
  batchLot?: boolean;
  samplesRemaining?: number;
  inspectionPlan?: InspectionPlanRow[];
  inspectionDocumentPdfUrl?: string | null;
  inspected: number;
  sampleSize: number;
  fails: number;
  acceptanceNumber: number;
  onClose: () => void;
};

export default function ScanInspectionSample({
  inspectionId,
  isSerial,
  remaining,
  batchLot = false,
  samplesRemaining,
  inspectionPlan = [],
  inspectionDocumentPdfUrl,
  inspected,
  sampleSize,
  fails,
  acceptanceNumber,
  onClose
}: Props) {
  const { t } = useLingui();
  const fetcher = useFetcher<{ error?: unknown; success?: boolean }>();
  const hasDocumentPlan = inspectionPlan.length > 0;
  const showDrawing = hasDocumentPlan && !!inspectionDocumentPdfUrl?.trim();

  const [serial, setSerial] = useState("");
  const [selected, setSelected] = useState<InspectionTrackedEntity | null>(
    null
  );
  const [pendingStatus, setPendingStatus] = useState<"Passed" | "Failed">(
    "Passed"
  );
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [measuredValues, setMeasuredValues] = useState<Record<string, string>>(
    {}
  );
  const [focusedFeatureId, setFocusedFeatureId] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const findMatch = (value: string): InspectionTrackedEntity | null => {
    if (!value) return null;
    const needle = value.toLowerCase();
    return (
      remaining.find((e) => {
        if (e.id === value) return true;
        if (e.readableId && e.readableId.toLowerCase() === needle) return true;
        return false;
      }) ?? null
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: keep findMatch around for future UI without re-introducing unused-variable churn
  useEffect(() => {
    setSelected(findMatch(serial));
  }, [serial, remaining]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) {
      setSerial("");
      setSelected(null);
      setMeasuredValues({});
      setFocusedFeatureId(null);
      setOverrideEnabled(false);
      setPendingStatus("Passed");
      setResetKey((k) => k + 1);
    }
  }, [fetcher.state, fetcher.data]);

  const rowEvaluations = useMemo(() => {
    return inspectionPlan.map((row) => {
      const measuredValue = measuredValues[row.featureId] ?? "";
      return {
        row,
        measuredValue,
        ...evaluateCharacteristicMeasurement({
          nominalValue: row.nominalValue,
          tolerancePlus: row.tolerancePlus,
          toleranceMinus: row.toleranceMinus,
          measuredValue
        })
      };
    });
  }, [inspectionPlan, measuredValues]);

  const autoStatus = useMemo(
    () => computeSampleAutoStatus(rowEvaluations),
    [rowEvaluations]
  );

  const effectiveStatus = overrideEnabled
    ? pendingStatus
    : (autoStatus ?? pendingStatus);

  const measurementsJson = useMemo(
    () =>
      JSON.stringify(
        inspectionPlan.map((row) => ({
          inspectionFeatureId: row.featureId,
          measuredValue: measuredValues[row.featureId] ?? ""
        }))
      ),
    [inspectionPlan, measuredValues]
  );

  const isSubmitting = fetcher.state !== "idle";
  const hasSelection = isSerial ? !!selected : true;
  const canRecord = hasSelection;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <ModalContent
        size={showDrawing ? "xxxlarge" : "large"}
        className={
          showDrawing
            ? "!fixed !inset-0 !left-0 !top-0 !translate-x-0 !translate-y-0 !max-w-none w-screen h-[100dvh] max-h-[100dvh] rounded-none sm:rounded-none flex flex-col gap-0"
            : undefined
        }
      >
        <ModalHeader className={showDrawing ? "shrink-0 mb-2" : undefined}>
          <ModalTitle>
            <Trans>Inspect Item</Trans>
          </ModalTitle>
          <ModalDescription>
            {batchLot ? (
              <Trans>
                Scan or select the batch and record each sample result.{" "}
                {samplesRemaining ?? 0} of {sampleSize} required samples
                remaining.
              </Trans>
            ) : isSerial ? (
              <Trans>
                Scan or select a tracked entity from this lot and record the
                inspection result.
              </Trans>
            ) : (
              <Trans>Record the inspection result for this sample.</Trans>
            )}
          </ModalDescription>
        </ModalHeader>
        <ValidatedForm
          key={`${selected?.id ?? "none"}-${resetKey}`}
          fetcher={fetcher}
          method="post"
          action={`${path.to.inboundInspection(inspectionId)}/sample`}
          validator={inboundInspectionSampleValidator}
          className={showDrawing ? "flex flex-col flex-1 min-h-0" : undefined}
          defaultValues={{
            inspectionId,
            trackedEntityId: selected?.id ?? "",
            status: effectiveStatus,
            notes: ""
          }}
        >
          <ModalBody
            className={
              showDrawing ? "flex-1 min-h-0 overflow-hidden mb-0" : undefined
            }
          >
            <div
              className={
                showDrawing
                  ? "grid grid-cols-1 lg:grid-cols-2 gap-4 w-full h-full min-h-0"
                  : "w-full"
              }
            >
              {showDrawing && inspectionDocumentPdfUrl && (
                <div className="flex flex-col min-h-0 h-full min-h-[320px] lg:min-h-0">
                  <ClientOnly
                    fallback={
                      <div className="flex flex-1 min-h-[280px] items-center justify-center">
                        <Spinner />
                      </div>
                    }
                  >
                    {() => (
                      <Suspense
                        fallback={
                          <div className="flex flex-1 min-h-[280px] items-center justify-center">
                            <Spinner />
                          </div>
                        }
                      >
                        <InspectionDocumentViewer
                          pdfUrl={inspectionDocumentPdfUrl}
                          plan={inspectionPlan}
                          highlightFeatureId={focusedFeatureId}
                          fillHeight
                        />
                      </Suspense>
                    )}
                  </ClientOnly>
                </div>
              )}

              <div
                className={
                  showDrawing ? "min-h-0 overflow-y-auto pr-1" : "w-full"
                }
              >
                <VStack spacing={4} className="w-full min-w-0">
                  <BarProgress
                    label={t`Progress`}
                    value={`${inspected} / ${sampleSize} · ${fails} ${fails === 1 ? "failure" : "failures"} · Ac ${acceptanceNumber}`}
                    progress={inspected}
                    max={Math.max(1, sampleSize)}
                    activeClassName={
                      fails > acceptanceNumber ? "bg-red-500" : "bg-emerald-500"
                    }
                  />

                  {(isSerial || batchLot) && (
                    <Tabs defaultValue="scan" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="scan">
                          <LuQrCode className="mr-2" />
                          <Trans>Scan</Trans>
                        </TabsTrigger>
                        <TabsTrigger value="select">
                          <LuList className="mr-2" />
                          <Trans>Select</Trans>
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="scan" className="mt-0 w-full">
                        <VStack spacing={3} className="w-full">
                          <InputGroup className="w-full">
                            <Input
                              autoFocus
                              placeholder={t`Scan or enter tracked entity ID, serial, or batch`}
                              value={serial}
                              onChange={(e) => setSerial(e.target.value)}
                            />
                            <InputRightElement>
                              {serial &&
                                (hasSelection ? (
                                  <LuCheck className="text-green-500" />
                                ) : (
                                  <LuX className="text-red-500" />
                                ))}
                            </InputRightElement>
                          </InputGroup>

                          {selected && (
                            <div className="w-full rounded-md border p-3">
                              <div className="text-xs text-muted-foreground">
                                <Trans>Tracked Entity</Trans>
                              </div>
                              <div className="font-mono text-sm">
                                {selected.readableId ?? selected.id}
                              </div>
                              {batchLot && selected.quantity != null && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  <Trans>
                                    Batch quantity: {selected.quantity}
                                  </Trans>
                                </div>
                              )}
                              {selected.readableId && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {selected.id}
                                </div>
                              )}
                            </div>
                          )}
                        </VStack>
                      </TabsContent>
                      <TabsContent value="select" className="mt-0 w-full">
                        <ScrollArea className="h-[40dvh] w-full">
                          <VStack spacing={2} className="w-full pr-3">
                            {remaining.length === 0 ? (
                              <p className="text-center text-muted-foreground w-full py-6">
                                {batchLot ? (
                                  <Trans>
                                    All required samples have been recorded.
                                  </Trans>
                                ) : (
                                  <Trans>
                                    No remaining entities to inspect.
                                  </Trans>
                                )}
                              </p>
                            ) : (
                              remaining.map((e) => {
                                const isSelected = selected?.id === e.id;
                                return (
                                  <HStack
                                    key={e.id}
                                    className="w-full justify-between p-4 border rounded-md"
                                  >
                                    <VStack
                                      spacing={0}
                                      className="w-full items-start min-w-0"
                                    >
                                      <p className="font-mono text-sm truncate w-full">
                                        {e.readableId ?? e.id}
                                      </p>
                                      {e.readableId && (
                                        <p className="text-xs text-muted-foreground truncate w-full">
                                          {e.id}
                                        </p>
                                      )}
                                    </VStack>
                                    <Button
                                      size="sm"
                                      variant={
                                        isSelected ? "primary" : "secondary"
                                      }
                                      onClick={() => setSerial(e.id)}
                                    >
                                      {isSelected ? (
                                        <Trans>Selected</Trans>
                                      ) : (
                                        <Trans>Select</Trans>
                                      )}
                                    </Button>
                                  </HStack>
                                );
                              })
                            )}
                          </VStack>
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  )}

                  {hasDocumentPlan && hasSelection && (
                    <div className="w-full border rounded-md overflow-hidden">
                      <table className="text-sm w-full">
                        <thead className="bg-muted text-xs text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">
                              <Trans>Characteristic</Trans>
                            </th>
                            <th className="text-left px-3 py-2 font-medium">
                              <Trans>Nominal</Trans>
                            </th>
                            <th className="text-left px-3 py-2 font-medium">
                              +
                            </th>
                            <th className="text-left px-3 py-2 font-medium">
                              −
                            </th>
                            <th className="text-left px-3 py-2 font-medium">
                              <Trans>Unit</Trans>
                            </th>
                            <th className="text-left px-3 py-2 font-medium">
                              <Trans>Measured</Trans>
                            </th>
                            <th className="text-left px-3 py-2 font-medium">
                              <Trans>Status</Trans>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowEvaluations.map(
                            ({ row, measuredValue, inTolerance }) => (
                              <tr
                                key={row.featureId}
                                className={`border-t ${
                                  focusedFeatureId === row.featureId
                                    ? "bg-muted/50"
                                    : ""
                                }`}
                              >
                                <td className="px-3 py-2">
                                  <div className="font-medium">
                                    {row.characteristic}
                                  </div>
                                  {row.description && (
                                    <div className="text-xs text-muted-foreground">
                                      {row.description}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {row.nominalValue ?? "—"}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {row.tolerancePlus ?? "—"}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  {row.toleranceMinus ?? "—"}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {row.unit ?? "—"}
                                </td>
                                <td className="px-3 py-2">
                                  <Input
                                    value={measuredValue}
                                    onFocus={() =>
                                      setFocusedFeatureId(row.featureId)
                                    }
                                    onChange={(e) =>
                                      setMeasuredValues((prev) => ({
                                        ...prev,
                                        [row.featureId]: e.target.value
                                      }))
                                    }
                                    className="font-mono text-xs h-8"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  {inTolerance === true ? (
                                    <Badge variant="green">
                                      <Trans>In</Trans>
                                    </Badge>
                                  ) : inTolerance === false ? (
                                    <Badge variant="red">
                                      <Trans>Out</Trans>
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">—</Badge>
                                  )}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {hasDocumentPlan && hasSelection && (
                    <div className="w-full rounded-md border p-3 text-sm">
                      <Trans>Suggested result:</Trans>{" "}
                      {autoStatus ? (
                        <Badge
                          variant={autoStatus === "Passed" ? "green" : "red"}
                        >
                          {autoStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          <Trans>
                            Enter measurements with numeric tolerances to
                            compute a result, or override manually.
                          </Trans>
                        </span>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <Checkbox
                          id="override-result"
                          isChecked={overrideEnabled}
                          onCheckedChange={(checked) =>
                            setOverrideEnabled(checked === true)
                          }
                        />
                        <label htmlFor="override-result" className="text-sm">
                          <Trans>Override suggested result</Trans>
                        </label>
                      </div>
                    </div>
                  )}

                  <Hidden name="inspectionId" value={inspectionId} />
                  <Hidden name="trackedEntityId" value={selected?.id ?? ""} />
                  <Hidden name="status" value={effectiveStatus} />
                  {hasDocumentPlan && (
                    <Hidden name="measurements" value={measurementsJson} />
                  )}
                  {hasDocumentPlan && overrideEnabled && (
                    <Hidden name="statusOverride" value={pendingStatus} />
                  )}

                  <TextArea
                    name="notes"
                    label={t`Notes`}
                    isDisabled={!canRecord}
                  />
                </VStack>
              </div>
            </div>
          </ModalBody>
          <ModalFooter className={showDrawing ? "shrink-0" : undefined}>
            <HStack spacing={2}>
              <Button variant="secondary" onClick={onClose}>
                <Trans>Close</Trans>
              </Button>
              {hasDocumentPlan && !overrideEnabled ? (
                <Submit
                  leftIcon={<LuCircleCheck />}
                  isDisabled={!canRecord || isSubmitting}
                >
                  <Trans>Save Sample</Trans>
                </Submit>
              ) : (
                <>
                  <Submit
                    variant="destructive"
                    leftIcon={<LuCircleX />}
                    isDisabled={!canRecord || isSubmitting}
                    onClick={() => setPendingStatus("Failed")}
                  >
                    <Trans>Fail</Trans>
                  </Submit>
                  <Submit
                    leftIcon={<LuCircleCheck />}
                    isDisabled={!canRecord || isSubmitting}
                    onClick={() => setPendingStatus("Passed")}
                  >
                    <Trans>Pass</Trans>
                  </Submit>
                </>
              )}
            </HStack>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
}
