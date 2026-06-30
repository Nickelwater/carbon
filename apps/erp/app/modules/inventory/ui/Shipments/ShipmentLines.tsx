import { useCarbon } from "@carbon/auth";
import { Number as FormNumber, Submit, ValidatedForm } from "@carbon/form";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Combobox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIcon,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Heading,
  HStack,
  IconButton,
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
  NumberField,
  NumberInput,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  toast,
  useDisclosure,
  VStack
} from "@carbon/react";
import type { TrackedEntityAttributes } from "@carbon/utils";
import {
  getItemReadableId,
  getShipmentBatchTrackingsForLine
} from "@carbon/utils";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  LuArrowDown,
  LuArrowUp,
  LuArrowUpDown,
  LuCheck,
  LuCircleAlert,
  LuCirclePlus,
  LuEllipsisVertical,
  LuGroup,
  LuInfo,
  LuQrCode,
  LuSplit,
  LuTrash
} from "react-icons/lu";
import { Link, Outlet, useFetcher, useFetchers, useParams } from "react-router";
import {
  Empty,
  ItemThumbnail,
  PrintButton,
  ShippingLabelPrintButton
} from "~/components";
import { Enumerable } from "~/components/Enumerable";
import { useStorageUnits } from "~/components/Form/StorageUnit";
import { useUnitOfMeasure } from "~/components/Form/UnitOfMeasure";
import { ConfirmDelete } from "~/components/Modals";
import { useDateFormatter, useRouteData, useUser } from "~/hooks";
import type {
  getBatchNumbersForItem,
  getSerialNumbersForItem,
  Shipment,
  ShipmentLine,
  ShipmentLineTracking,
  ShipmentSourceDocument
} from "~/modules/inventory";
import {
  getAvailableSalesOrderLinesForCustomer,
  getLiveInventoryQuantitiesAtLocation,
  shipmentLineRequiresInventoryCheck,
  splitValidator
} from "~/modules/inventory";
import { getCustomer, getCustomerPartsForCustomer } from "~/modules/sales";
import { formatSalesOrderLineNumber } from "~/modules/sales/sales.models";
import type { CustomerPartMapping } from "~/modules/sales/ui/SalesOrder/contractCustomerPartLabelLogic";
import { customerPartNumberLabel } from "~/modules/sales/ui/SalesOrder/contractCustomerPartLabelLogic";
import type { action as shipmentLinesAddAction } from "~/routes/x+/shipment+/lines.add";
import type { action as shipmentLinesUpdateAction } from "~/routes/x+/shipment+/lines.update";
import { useItems } from "~/stores";
import type { Item } from "~/stores/items";
import { path } from "~/utils/path";

type AvailableShipmentLine = {
  id: string;
  itemId: string | null;
  description?: string | null;
  quantityToSend: number | null;
  quantitySent?: number | null;
  saleQuantity?: number | null;
  promisedDate?: string | null;
  salesOrderReadableId: string | null;
  salesOrderId: string;
  unitOfMeasureCode?: string | null;
};

type AddLineSortColumn = "order" | "item" | "promised" | "qtyDue" | "onHand";

function getShipmentLineColumnCount(showSalesOrderColumns: boolean) {
  return showSalesOrderColumns ? 8 : 5;
}

function ShipmentLineColgroup({
  showSalesOrderColumns
}: {
  showSalesOrderColumns: boolean;
}) {
  if (showSalesOrderColumns) {
    return (
      <colgroup>
        <col />
        <col className="w-[6.5rem]" />
        <col className="w-10" />
        <col className="w-[7.5rem]" />
        <col className="w-[7.5rem]" />
        <col className="w-16" />
        <col className="w-20" />
        <col className="w-[5.5rem]" />
      </colgroup>
    );
  }

  return (
    <colgroup>
      <col />
      <col className="w-[7.5rem]" />
      <col className="w-16" />
      <col className="w-20" />
      <col className="w-[5.5rem]" />
    </colgroup>
  );
}

type ShipmentBatchAssignment = {
  index: number;
  batchNumber: string;
  quantity: number;
};

function buildBatchAssignmentsForLine(
  line: ShipmentLine,
  trackings: ShipmentLineTracking[]
): ShipmentBatchAssignment[] {
  const lineBatches = getShipmentBatchTrackingsForLine(trackings, line.id!);
  if (lineBatches.length === 0) {
    return [{ index: 0, batchNumber: "", quantity: 0 }];
  }

  return lineBatches.map((tracking, rowIndex) => {
    const attributes = tracking.attributes as TrackedEntityAttributes;
    const explicitAllocated = attributes["Allocated Quantity"];
    let quantity = 0;
    if (explicitAllocated !== undefined && explicitAllocated !== null) {
      quantity = Number(explicitAllocated);
    } else if (lineBatches.length === 1) {
      quantity = Number(line.shippedQuantity ?? 0);
    }

    return {
      index: attributes["Shipment Line Batch Index"] ?? rowIndex,
      batchNumber: tracking.readableId ?? tracking.id,
      quantity
    };
  });
}

function buildBatchAssignmentsByLineId(
  lines: ShipmentLine[],
  trackings: ShipmentLineTracking[]
): Record<string, ShipmentBatchAssignment[]> {
  return lines.reduce<Record<string, ShipmentBatchAssignment[]>>(
    (acc, line) => {
      if (!line.id || !line.requiresBatchTracking) return acc;
      acc[line.id] = buildBatchAssignmentsForLine(line, trackings);
      return acc;
    },
    {}
  );
}

const ShipmentLines = ({
  selectedCustomerId,
  sourceDocument = "Sales Order"
}: {
  selectedCustomerId?: string;
  sourceDocument?: ShipmentSourceDocument;
}) => {
  const { shipmentId } = useParams();
  if (!shipmentId) throw new Error("shipmentId not found");

  const { carbon } = useCarbon();
  const { company } = useUser();

  const fetcher = useFetcher<typeof shipmentLinesUpdateAction>();
  const addLineFetcher = useFetcher<typeof shipmentLinesAddAction>();
  const addLineDisclosure = useDisclosure();
  const [items] = useItems();
  const [optimisticLineUpdates, setOptimisticLineUpdates] = useState<
    Record<string, { shippedQuantity?: number; storageUnitId?: string | null }>
  >({});

  const routeData = useRouteData<{
    shipment: Shipment;
    shipmentLines: ShipmentLine[];
    shipmentLineTracking: ShipmentLineTracking[];
    availableShipmentLines?: AvailableShipmentLine[];
    customer?: { contractCustomer?: boolean | null } | null;
    customerParts?: CustomerPartMapping[];
    fixedAssetLines: {
      id: string;
      salesOrderLineId: string;
      assetId: string;
      assetName: string | null;
      assetReadableId: string | null;
      description: string | null;
      shipped: boolean;
      serialNumber: string | null;
    }[];
  }>(path.to.shipment(shipmentId));

  const [batchAssignmentsByLineId, setBatchAssignmentsByLineId] = useState<
    Record<string, ShipmentBatchAssignment[]>
  >(() =>
    buildBatchAssignmentsByLineId(
      routeData?.shipmentLines ?? [],
      routeData?.shipmentLineTracking ?? []
    )
  );

  useEffect(() => {
    setBatchAssignmentsByLineId(
      buildBatchAssignmentsByLineId(
        routeData?.shipmentLines ?? [],
        routeData?.shipmentLineTracking ?? []
      )
    );
  }, [routeData?.shipmentLineTracking, routeData?.shipmentLines?.length]);

  const shipmentLocationId = routeData?.shipment?.locationId ?? undefined;
  const { formatDate } = useDateFormatter();

  const [availableShipmentLines, setAvailableShipmentLines] = useState<
    AvailableShipmentLine[]
  >(routeData?.availableShipmentLines ?? []);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(
    () => new Set()
  );
  const [showCustomerPartNumbers, setShowCustomerPartNumbers] = useState(true);
  const [liveOnHandByItemId, setLiveOnHandByItemId] = useState<
    Record<string, number>
  >({});
  const [clientCustomerPartContext, setClientCustomerPartContext] = useState<{
    contractCustomer: boolean;
    customerParts: CustomerPartMapping[];
  } | null>(null);

  const effectiveCustomerId =
    selectedCustomerId ?? routeData?.shipment?.customerId ?? undefined;

  const customerPartContext = useMemo(() => {
    if (
      effectiveCustomerId &&
      effectiveCustomerId === routeData?.shipment?.customerId
    ) {
      return {
        contractCustomer: !!routeData?.customer?.contractCustomer,
        customerParts: routeData?.customerParts ?? []
      };
    }
    return clientCustomerPartContext;
  }, [
    clientCustomerPartContext,
    effectiveCustomerId,
    routeData?.customer?.contractCustomer,
    routeData?.customerParts,
    routeData?.shipment?.customerId
  ]);

  const canToggleCustomerParts =
    !!customerPartContext?.contractCustomer &&
    (customerPartContext.customerParts.length ?? 0) > 0;

  useEffect(() => {
    if (!effectiveCustomerId || !carbon || sourceDocument !== "Sales Order") {
      setClientCustomerPartContext(null);
      return;
    }

    if (effectiveCustomerId === routeData?.shipment?.customerId) {
      setClientCustomerPartContext(null);
      return;
    }

    let cancelled = false;
    getCustomer(carbon, effectiveCustomerId).then(async (customerResult) => {
      const customer = customerResult.data;
      if (
        cancelled ||
        !(customer as { contractCustomer?: boolean | null })
          ?.contractCustomer ||
        !customer.id
      ) {
        if (!cancelled) {
          setClientCustomerPartContext({
            contractCustomer: false,
            customerParts: []
          });
        }
        return;
      }

      const partsResult = await getCustomerPartsForCustomer(
        carbon,
        customer.id,
        company.id
      );
      if (!cancelled) {
        setClientCustomerPartContext({
          contractCustomer: true,
          customerParts: partsResult.data ?? []
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    carbon,
    company.id,
    effectiveCustomerId,
    routeData?.shipment?.customerId,
    sourceDocument
  ]);

  useEffect(() => {
    if (!effectiveCustomerId || !carbon || sourceDocument !== "Sales Order") {
      setAvailableShipmentLines([]);
      return;
    }

    if (
      effectiveCustomerId === routeData?.shipment?.customerId &&
      routeData?.availableShipmentLines
    ) {
      setAvailableShipmentLines(routeData.availableShipmentLines);
      return;
    }

    let cancelled = false;
    getAvailableSalesOrderLinesForCustomer(
      carbon,
      effectiveCustomerId,
      company.id,
      { excludeShipmentId: shipmentId }
    ).then((result) => {
      if (!cancelled) {
        setAvailableShipmentLines(result.data ?? []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    carbon,
    company.id,
    effectiveCustomerId,
    routeData?.availableShipmentLines,
    routeData?.shipment?.customerId,
    shipmentId,
    sourceDocument
  ]);

  useEffect(() => {
    if (!addLineDisclosure.isOpen) {
      setSelectedLineIds(new Set());
      setAddLineSortColumn("promised");
      setAddLineSortDirection("asc");
      setShowCustomerPartNumbers(true);
    }
  }, [addLineDisclosure.isOpen]);

  const [addLineSortColumn, setAddLineSortColumn] =
    useState<AddLineSortColumn>("promised");
  const [addLineSortDirection, setAddLineSortDirection] = useState<
    "asc" | "desc"
  >("asc");

  const sortedAvailableShipmentLines = useMemo(
    () =>
      [...availableShipmentLines].sort((a, b) =>
        compareAddShipmentLines(
          a,
          b,
          addLineSortColumn,
          addLineSortDirection,
          items,
          shipmentLocationId,
          canToggleCustomerParts && showCustomerPartNumbers
            ? customerPartContext?.customerParts
            : undefined,
          liveOnHandByItemId
        )
      ),
    [
      addLineSortColumn,
      addLineSortDirection,
      availableShipmentLines,
      canToggleCustomerParts,
      customerPartContext?.customerParts,
      items,
      liveOnHandByItemId,
      shipmentLocationId,
      showCustomerPartNumbers
    ]
  );

  const onAddLineSort = (column: AddLineSortColumn) => {
    if (addLineSortColumn === column) {
      setAddLineSortDirection((direction) =>
        direction === "asc" ? "desc" : "asc"
      );
    } else {
      setAddLineSortColumn(column);
      setAddLineSortDirection("asc");
    }
  };

  const shipmentsById = new Map<string, ShipmentLine>(
    // @ts-expect-error
    (routeData?.shipmentLines ?? []).map((line) => [line.id, line])
  );
  const pendingShipmentLines = usePendingShipmentLines();

  for (let pendingShipmentLine of pendingShipmentLines) {
    let item = shipmentsById.get(pendingShipmentLine.id);
    let merged = item
      ? { ...item, ...pendingShipmentLine }
      : pendingShipmentLine;
    shipmentsById.set(pendingShipmentLine.id, merged as ShipmentLine);
  }

  for (const [lineId, optimistic] of Object.entries(optimisticLineUpdates)) {
    const item = shipmentsById.get(lineId);
    if (!item) continue;
    shipmentsById.set(lineId, {
      ...item,
      ...(optimistic.shippedQuantity !== undefined
        ? { shippedQuantity: optimistic.shippedQuantity }
        : {}),
      ...(optimistic.storageUnitId !== undefined
        ? { storageUnitId: optimistic.storageUnitId }
        : {})
    });
  }

  const shipmentLines = Array.from(shipmentsById.values()).map((line) => ({
    ...line,
    shippedQuantity: Number(line.shippedQuantity ?? 0)
  }));

  const inventoryItemIds = useMemo(
    () => [
      ...new Set(
        [
          ...(routeData?.shipmentLines ?? []).map((line) => line.itemId),
          ...availableShipmentLines.map((line) => line.itemId)
        ].filter((itemId): itemId is string => !!itemId)
      )
    ],
    [availableShipmentLines, routeData?.shipmentLines]
  );

  const refreshLiveInventory = useCallback(async () => {
    if (!carbon || !shipmentLocationId) return;

    if (inventoryItemIds.length === 0) return;

    const result = await getLiveInventoryQuantitiesAtLocation(
      carbon,
      company.id,
      shipmentLocationId,
      inventoryItemIds
    );

    if (result.data) {
      setLiveOnHandByItemId(result.data);
    }
  }, [carbon, company.id, inventoryItemIds, shipmentLocationId]);

  useEffect(() => {
    if (!routeData?.shipmentLines) return;

    setOptimisticLineUpdates((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const [lineId, optimistic] of Object.entries(prev)) {
        const serverLine = routeData.shipmentLines.find(
          (line) => line.id === lineId
        );
        if (!serverLine) continue;

        const quantityMatches =
          optimistic.shippedQuantity === undefined ||
          Number(serverLine.shippedQuantity ?? 0) ===
            optimistic.shippedQuantity;
        const storageUnitMatches =
          optimistic.storageUnitId === undefined ||
          (serverLine.storageUnitId ?? null) === optimistic.storageUnitId;

        if (quantityMatches && storageUnitMatches) {
          delete next[lineId];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [routeData?.shipmentLines]);

  useEffect(() => {
    if (fetcher.data?.error?.message) {
      toast.error(fetcher.data.error.message);
      setOptimisticLineUpdates({});
    }
  }, [fetcher.data]);

  useEffect(() => {
    refreshLiveInventory();
  }, [refreshLiveInventory]);

  useEffect(() => {
    if (addLineDisclosure.isOpen) {
      refreshLiveInventory();
    }
  }, [addLineDisclosure.isOpen, refreshLiveInventory]);

  const [serialNumbersByLineId, setSerialNumbersByLineId] = useState<
    Record<string, { index: number; id: string }[]>
  >(() => {
    return shipmentLines.reduce((acc, line) => {
      if (!line.requiresSerialTracking) return acc;

      const trackedEntitiesForLine = routeData?.shipmentLineTracking?.filter(
        (t) => {
          const attributes = t.attributes as TrackedEntityAttributes;
          return attributes["Shipment Line"] === line.id;
        }
      );

      if (!trackedEntitiesForLine) return acc;
      return {
        ...acc,
        [line.id!]: Array.from(
          { length: line.shippedQuantity || 0 },
          (_, index) => {
            const serialNumberEntity = trackedEntitiesForLine.find((t) => {
              const attributes = t.attributes as TrackedEntityAttributes;
              return attributes["Shipment Line Index"] === index;
            });

            const serialNumber =
              serialNumberEntity?.readableId || serialNumberEntity?.id || "";

            return {
              index,
              id: serialNumber
            };
          }
        )
      };
    }, {});
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  useEffect(() => {
    setSerialNumbersByLineId(
      shipmentLines.reduce((acc, line) => {
        if (!line.requiresSerialTracking) return acc;

        const trackedEntitiesForLine = routeData?.shipmentLineTracking?.filter(
          (t) => {
            const attributes = t.attributes as TrackedEntityAttributes;
            return attributes["Shipment Line"] === line.id;
          }
        );

        if (!trackedEntitiesForLine) return acc;
        return {
          ...acc,
          [line.id!]: Array.from(
            { length: line.shippedQuantity || 0 },
            (_, index) => {
              const serialNumberEntity = trackedEntitiesForLine.find((t) => {
                const attributes = t.attributes as TrackedEntityAttributes;
                return attributes["Shipment Line Index"] === index;
              });

              const serialNumber =
                serialNumberEntity?.readableId || serialNumberEntity?.id || "";

              return {
                index,
                id: serialNumber
              };
            }
          )
        };
      }, {})
    );
  }, [routeData?.shipment?.sourceDocumentId, routeData?.shipmentLines?.length]);

  const onUpdateShipmentLine = useCallback(
    async ({
      lineId,
      field,
      value
    }:
      | {
          lineId: string;
          field: "shippedQuantity";
          value: number;
        }
      | {
          lineId: string;
          field: "storageUnitId";
          value: string;
        }) => {
      setOptimisticLineUpdates((prev) => ({
        ...prev,
        [lineId]: {
          ...prev[lineId],
          [field]: value
        }
      }));

      const formData = new FormData();

      formData.append("ids", lineId);
      formData.append("field", field);
      formData.append("value", value.toString());
      fetcher.submit(formData, {
        method: "post",
        action: path.to.bulkUpdateShipmentLine
      });
    },
    [fetcher]
  );

  const isPosted = routeData?.shipment?.status === "Posted";
  const isVoided = routeData?.shipment?.status === "Voided";
  const isReadOnly = isPosted || isVoided;

  const canAddLine =
    sourceDocument === "Sales Order" &&
    effectiveCustomerId &&
    !isPosted &&
    !isVoided &&
    availableShipmentLines.length > 0;

  const onAddSelectedLines = () => {
    if (selectedLineIds.size === 0) return;
    const formData = new FormData();
    formData.append("shipmentId", shipmentId);
    formData.append(
      "salesOrderLineIds",
      JSON.stringify(Array.from(selectedLineIds))
    );
    addLineFetcher.submit(formData, {
      method: "post",
      action: path.to.shipmentLinesAdd
    });
    addLineDisclosure.onClose();
  };

  const toggleLineSelection = (lineId: string) => {
    setSelectedLineIds((prev) => {
      if (prev.has(lineId)) {
        const next = new Set(prev);
        next.delete(lineId);
        return next;
      }

      const line = availableShipmentLines.find((entry) => entry.id === lineId);
      if (
        !line ||
        !isAvailableLineShippable(
          line,
          items,
          shipmentLocationId,
          shipmentLines,
          prev,
          availableShipmentLines,
          liveOnHandByItemId
        )
      ) {
        return prev;
      }

      const next = new Set(prev);
      next.add(lineId);
      return next;
    });
  };

  const isAddLineShippable = useCallback(
    (line: AvailableShipmentLine, selectedLineIds: Set<string>) =>
      isAvailableLineShippable(
        line,
        items,
        shipmentLocationId,
        shipmentLines,
        selectedLineIds,
        availableShipmentLines,
        liveOnHandByItemId
      ),
    [
      availableShipmentLines,
      items,
      liveOnHandByItemId,
      shipmentLines,
      shipmentLocationId
    ]
  );

  const selectableAvailableLines = useMemo(
    () =>
      sortedAvailableShipmentLines.filter((line) =>
        isAddLineShippable(line, selectedLineIds)
      ),
    [isAddLineShippable, selectedLineIds, sortedAvailableShipmentLines]
  );

  const allLinesSelected =
    selectableAvailableLines.length > 0 &&
    selectableAvailableLines.every((line) => selectedLineIds.has(line.id));
  const someLinesSelected =
    selectableAvailableLines.some((line) => selectedLineIds.has(line.id)) &&
    !allLinesSelected;

  const toggleAllLines = () => {
    setSelectedLineIds((prev) => {
      const allSelected =
        selectableAvailableLines.length > 0 &&
        selectableAvailableLines.every((line) => prev.has(line.id));
      if (allSelected) return new Set();

      const next = new Set<string>();
      for (const line of sortedAvailableShipmentLines) {
        if (isAddLineShippable(line, next)) {
          next.add(line.id);
        }
      }
      return next;
    });
  };

  const hasSalesOrderColumns = shipmentLines.some((line) => line.lineId);
  const shipmentLineColumnCount =
    getShipmentLineColumnCount(hasSalesOrderColumns);

  return (
    <>
      <Card>
        <HStack className="w-full justify-between">
          <CardHeader>
            <CardTitle>
              <Trans>Shipment Lines</Trans>
            </CardTitle>
          </CardHeader>
          {canAddLine && (
            <CardAction>
              <Button
                leftIcon={<LuCirclePlus />}
                variant="secondary"
                onClick={addLineDisclosure.onOpen}
                isLoading={addLineFetcher.state !== "idle"}
              >
                Add shipment line
              </Button>
            </CardAction>
          )}
        </HStack>

        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            {shipmentLines.length === 0 ? (
              <Empty className="py-6" />
            ) : (
              <table className="w-full table-fixed border-separate border-spacing-0">
                <ShipmentLineColgroup
                  showSalesOrderColumns={hasSalesOrderColumns}
                />
                <thead className="bg-muted/20 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2.5 pl-6 pr-3 text-left font-medium align-bottom">
                      <Trans>Item</Trans>
                    </th>
                    {hasSalesOrderColumns ? (
                      <>
                        <th className="py-2.5 px-2 text-left font-medium align-bottom">
                          <Trans>SO</Trans>
                        </th>
                        <th className="py-2.5 px-2 text-left font-medium align-bottom">
                          <Trans>Line</Trans>
                        </th>
                        <th className="py-2.5 px-2 text-left font-medium align-bottom">
                          <Trans>Promised</Trans>
                        </th>
                      </>
                    ) : null}
                    <th className="py-2.5 px-2 text-left font-medium align-bottom">
                      <Trans>Shipped</Trans>
                    </th>
                    <th className="py-2.5 px-2 text-left font-medium align-bottom">
                      <Trans>Ordered</Trans>
                    </th>
                    <th className="py-2.5 px-2 text-left font-medium align-bottom">
                      <Trans>Outstanding</Trans>
                    </th>
                    <th className="py-2.5 pr-6 pl-2 text-right font-medium align-bottom" />
                  </tr>
                </thead>
                <tbody>
                  {shipmentLines
                    .map((line) => ({
                      ...line,
                      itemReadableId:
                        getItemReadableId(items, line.itemId) ?? ""
                    }))
                    .sort((a, b) =>
                      a.itemReadableId.localeCompare(b.itemReadableId)
                    )
                    .map((line, index) => {
                      return (
                        <ShipmentLineItem
                          key={line.id}
                          line={line}
                          shipment={routeData?.shipment}
                          shipmentLines={shipmentLines}
                          liveOnHandByItemId={liveOnHandByItemId}
                          showSalesOrderColumns={hasSalesOrderColumns}
                          columnCount={shipmentLineColumnCount}
                          hasTrackingLabel={
                            routeData?.shipmentLineTracking?.some((t) => {
                              const attributes =
                                t.attributes as TrackedEntityAttributes;
                              return attributes["Shipment Line"] === line.id;
                            }) ?? false
                          }
                          isReadOnly={isReadOnly}
                          onUpdate={onUpdateShipmentLine}
                          className={
                            index === shipmentLines.length - 1
                              ? "border-none"
                              : ""
                          }
                          serialNumbers={serialNumbersByLineId[line.id!] || []}
                          onSerialNumbersChange={(newSerialNumbers) => {
                            setSerialNumbersByLineId((prev) => ({
                              ...prev,
                              [line.id!]: newSerialNumbers
                            }));
                          }}
                          batchAssignments={
                            batchAssignmentsByLineId[line.id!] ?? [
                              { index: 0, batchNumber: "", quantity: 0 }
                            ]
                          }
                          onBatchAssignmentsChange={(assignments) => {
                            setBatchAssignmentsByLineId((prev) => ({
                              ...prev,
                              [line.id!]: assignments
                            }));
                          }}
                        />
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <Modal
        open={addLineDisclosure.isOpen}
        onOpenChange={(open) => !open && addLineDisclosure.onClose()}
      >
        <ModalContent size="xlarge">
          <ModalHeader>
            <ModalTitle>
              <Trans>Add shipment lines</Trans>
            </ModalTitle>
            <ModalDescription>
              <Trans>
                Select open sales order lines to add to this shipment.
              </Trans>
            </ModalDescription>
          </ModalHeader>
          <ModalBody>
            <VStack spacing={3}>
              {canToggleCustomerParts ? (
                <HStack
                  spacing={3}
                  className="w-full items-center justify-between px-1"
                >
                  <Switch
                    variant="small"
                    label={<Trans>Customer part numbers</Trans>}
                    checked={showCustomerPartNumbers}
                    onCheckedChange={setShowCustomerPartNumbers}
                  />
                  <span className="text-xs text-muted-foreground">
                    {showCustomerPartNumbers ? (
                      <Trans>Showing this customer's part numbers</Trans>
                    ) : (
                      <Trans>Showing internal part numbers</Trans>
                    )}
                  </span>
                </HStack>
              ) : null}
              <div className="hidden sm:block max-h-[min(60vh,520px)] w-full overflow-y-auto">
                <table className="w-full table-fixed border-separate border-spacing-0">
                  <colgroup>
                    <col className="w-10" />
                    <col className="w-[6.5rem]" />
                    <col />
                    <col className="w-[7.5rem]" />
                    <col className="w-[7.5rem]" />
                    <col className="w-[7.5rem]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b text-xs font-medium uppercase text-muted-foreground">
                      <th className="py-2 pl-1 text-left align-bottom">
                        <Checkbox
                          isChecked={allLinesSelected}
                          isIndeterminate={someLinesSelected}
                          onCheckedChange={toggleAllLines}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="py-2 pr-2 text-left align-bottom">
                        <AddLineSortHeader
                          label={<Trans>Order</Trans>}
                          column="order"
                          activeColumn={addLineSortColumn}
                          direction={addLineSortDirection}
                          onSort={onAddLineSort}
                        />
                      </th>
                      <th className="py-2 pr-3 text-left align-bottom">
                        <AddLineSortHeader
                          label={<Trans>Item</Trans>}
                          column="item"
                          activeColumn={addLineSortColumn}
                          direction={addLineSortDirection}
                          onSort={onAddLineSort}
                        />
                      </th>
                      <th className="py-2 px-2 text-left align-bottom">
                        <AddLineSortHeader
                          label={<Trans>Promised</Trans>}
                          column="promised"
                          activeColumn={addLineSortColumn}
                          direction={addLineSortDirection}
                          onSort={onAddLineSort}
                        />
                      </th>
                      <th className="py-2 px-2 text-right align-bottom">
                        <AddLineSortHeader
                          label={<Trans>Qty due</Trans>}
                          column="qtyDue"
                          activeColumn={addLineSortColumn}
                          direction={addLineSortDirection}
                          onSort={onAddLineSort}
                          align="right"
                        />
                      </th>
                      <th className="py-2 pr-1 text-right align-bottom">
                        <AddLineSortHeader
                          label={<Trans>On hand</Trans>}
                          column="onHand"
                          activeColumn={addLineSortColumn}
                          direction={addLineSortDirection}
                          onSort={onAddLineSort}
                          align="right"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAvailableShipmentLines.map((line) => {
                      const isShippable = isAddLineShippable(
                        line,
                        selectedLineIds
                      );
                      return (
                        <AddShipmentLineTableRow
                          key={line.id}
                          line={line}
                          items={items}
                          locationId={shipmentLocationId}
                          liveOnHandByItemId={liveOnHandByItemId}
                          isSelected={selectedLineIds.has(line.id)}
                          isShippable={isShippable}
                          onToggle={() => toggleLineSelection(line.id)}
                          formatDate={formatDate}
                          showCustomerPartNumbers={
                            canToggleCustomerParts && showCustomerPartNumbers
                          }
                          customerParts={customerPartContext?.customerParts}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden max-h-[min(60vh,520px)] w-full overflow-y-auto">
                <HStack className="px-1 mb-2">
                  <Checkbox
                    isChecked={allLinesSelected}
                    isIndeterminate={someLinesSelected}
                    onCheckedChange={toggleAllLines}
                  />
                  <span className="text-xs uppercase text-muted-foreground">
                    <Trans>Select all</Trans>
                  </span>
                </HStack>
                {sortedAvailableShipmentLines.map((line) => {
                  const isShippable = isAddLineShippable(line, selectedLineIds);
                  return (
                    <AddShipmentLineCard
                      key={line.id}
                      line={line}
                      items={items}
                      locationId={shipmentLocationId}
                      liveOnHandByItemId={liveOnHandByItemId}
                      isSelected={selectedLineIds.has(line.id)}
                      isShippable={isShippable}
                      onToggle={() => toggleLineSelection(line.id)}
                      formatDate={formatDate}
                      showCustomerPartNumbers={
                        canToggleCustomerParts && showCustomerPartNumbers
                      }
                      customerParts={customerPartContext?.customerParts}
                    />
                  );
                })}
              </div>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={addLineDisclosure.onClose}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              variant="primary"
              onClick={onAddSelectedLines}
              isDisabled={selectedLineIds.size === 0}
              isLoading={addLineFetcher.state !== "idle"}
            >
              {selectedLineIds.size === 0 ? (
                <Trans>Add lines</Trans>
              ) : selectedLineIds.size === 1 ? (
                <Trans>Add line</Trans>
              ) : (
                <Trans>Add {selectedLineIds.size} lines</Trans>
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {routeData?.fixedAssetLines && routeData.fixedAssetLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Trans>Fixed Assets</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg">
              {routeData.fixedAssetLines.map((line, index) => (
                <ShipmentFixedAssetLineItem
                  key={line.id}
                  line={line}
                  isReadOnly={isReadOnly}
                  className={
                    index < routeData.fixedAssetLines.length - 1
                      ? "border-b"
                      : ""
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Outlet />
    </>
  );
};

function ShipmentFixedAssetLineItem({
  line,
  isReadOnly,
  className
}: {
  line: {
    id: string;
    salesOrderLineId: string;
    assetId: string;
    assetName: string | null;
    assetReadableId: string | null;
    description: string | null;
    shipped: boolean;
    serialNumber: string | null;
  };
  isReadOnly: boolean;
  className?: string;
}) {
  const fetcher = useFetcher();
  const [serialNumber, setSerialNumber] = useState(line.serialNumber ?? "");

  const updateField = (field: string, value: string) => {
    const formData = new FormData();
    formData.append("id", line.id);
    formData.append("field", field);
    formData.append("value", value);
    fetcher.submit(formData, {
      method: "post",
      action: path.to.shipmentFixedAssetLineUpdate
    });
  };

  return (
    <div className={cn("flex items-center gap-4 p-6", className)}>
      <Checkbox
        isChecked={line.shipped}
        disabled={isReadOnly}
        onCheckedChange={(checked) =>
          updateField("shipped", String(checked === true))
        }
      />
      <VStack spacing={0} className="flex-1 min-w-0">
        <span className="text-sm font-medium">
          {line.assetName ?? line.description ?? "Fixed Asset"}
        </span>
        {line.assetReadableId && (
          <span className="text-xs text-muted-foreground">
            {line.assetReadableId}
          </span>
        )}
      </VStack>
      <Input
        placeholder="Serial Number"
        value={serialNumber}
        isDisabled={isReadOnly}
        className="w-48"
        onChange={(e) => setSerialNumber(e.target.value)}
        onBlur={() => {
          if (serialNumber !== (line.serialNumber ?? "")) {
            updateField("serialNumber", serialNumber);
          }
        }}
      />
    </div>
  );
}

function ShipmentLineItem({
  line,
  shipment,
  shipmentLines,
  liveOnHandByItemId,
  showSalesOrderColumns,
  columnCount,
  className,
  hasTrackingLabel,
  isReadOnly,
  batchAssignments,
  onBatchAssignmentsChange,
  serialNumbers,
  onUpdate,
  onSerialNumbersChange
}: {
  line: ShipmentLine;
  shipment?: Shipment;
  shipmentLines: ShipmentLine[];
  liveOnHandByItemId?: Record<string, number>;
  showSalesOrderColumns: boolean;
  columnCount: number;
  className?: string;
  hasTrackingLabel: boolean;
  isReadOnly: boolean;
  batchAssignments: ShipmentBatchAssignment[];
  onBatchAssignmentsChange: (assignments: ShipmentBatchAssignment[]) => void;
  serialNumbers: { index: number; id: string }[];
  onSerialNumbersChange: (
    serialNumbers: { index: number; id: string }[]
  ) => void;
  onUpdate: ({
    lineId,
    field,
    value
  }:
    | {
        lineId: string;
        field: "shippedQuantity";
        value: number;
      }
    | {
        lineId: string;
        field: "storageUnitId";
        value: string;
      }) => Promise<void>;
}) {
  const { t } = useLingui();
  const { formatDate } = useDateFormatter();
  const [items] = useItems();
  const item = items.find((p) => p.id === line.itemId);
  const unitsOfMeasure = useUnitOfMeasure();
  const splitDisclosure = useDisclosure();
  const deleteDisclosure = useDisclosure();
  const [quantityDraft, setQuantityDraft] = useState<number | null>(null);
  const lineLocationId = line.locationId ?? shipment?.locationId ?? undefined;

  const maxShippableQuantity = getMaxShippableQuantityClient({
    itemId: line.itemId,
    item,
    fulfillmentType: line.fulfillment?.type,
    locationId: lineLocationId,
    items,
    outstandingQuantity: line.outstandingQuantity ?? 0,
    shipmentLines,
    currentLineId: line.id,
    liveOnHandByItemId,
    skipInventoryCap: isReadOnly
  });

  const inventoryOnHand =
    getInventoryOnHand(line.itemId, lineLocationId, items, liveOnHandByItemId)
      ?.quantity ?? 0;

  // Check if shipped quantity exceeds job quantity for job fulfillments
  const isJobOverShipped =
    !isReadOnly &&
    line.fulfillment?.type === "Job" &&
    (line.shippedQuantity || 0) > (line.fulfillment?.job?.quantity || 0);

  const isOverInventory =
    !isReadOnly &&
    lineRequiresInventoryCheck(item, line.fulfillment?.type) &&
    (line.shippedQuantity || 0) > maxShippableQuantity;

  const displayedShippedQuantity = quantityDraft ?? line.shippedQuantity ?? 0;

  const commitShippedQuantity = (rawValue: number) => {
    const safeValue = Number.isFinite(rawValue) ? rawValue : 0;
    const cappedValue = Math.min(Math.max(0, safeValue), maxShippableQuantity);

    setQuantityDraft(null);

    if (cappedValue === (line.shippedQuantity ?? 0)) {
      return;
    }

    onUpdate({
      lineId: line.id!,
      field: "shippedQuantity",
      value: cappedValue
    });

    if (cappedValue > serialNumbers.length) {
      onSerialNumbersChange([
        ...serialNumbers,
        ...Array.from(
          { length: cappedValue - serialNumbers.length },
          (_, index) => ({
            index: serialNumbers.length + index,
            id: ""
          })
        )
      ]);
    } else if (cappedValue < serialNumbers.length) {
      onSerialNumbersChange(serialNumbers.slice(0, cappedValue));
    }
  };

  useEffect(() => {
    setQuantityDraft(null);
  }, [line.id]);

  const lineDueDate = line.promisedDate ?? line.requestedDate ?? null;
  const salesOrderLineLabel =
    line.salesOrderLineNumber != null
      ? formatSalesOrderLineNumber({ lineNumber: line.salesOrderLineNumber }, 0)
      : null;

  const showStorageUnit =
    line.fulfillment?.type !== "Job" &&
    shipment?.sourceDocument !== "Purchase Order";
  const showDetails =
    showStorageUnit ||
    line.requiresBatchTracking ||
    line.requiresSerialTracking;

  return (
    <>
      <tr className={cn(!showDetails && "border-b", !showDetails && className)}>
        <td className="py-4 pl-6 pr-3 align-top">
          <HStack spacing={4} className="min-w-0">
            <ItemThumbnail
              size="md"
              thumbnailPath={line.thumbnailPath}
              type={(item?.type as "Part") ?? "Part"}
            />
            <VStack spacing={0} className="min-w-0 w-full">
              <div className="w-full overflow-hidden">
                <span className="text-sm font-medium truncate block w-full">
                  {item?.readableIdWithRevision}
                </span>
                <span className="text-xs text-muted-foreground truncate block w-full">
                  {item?.name}
                </span>
              </div>
              <div className="mt-2">
                <Enumerable
                  value={
                    unitsOfMeasure?.find((u) => u.value === line.unitOfMeasure)
                      ?.label ?? null
                  }
                />
              </div>
            </VStack>
          </HStack>
        </td>

        {showSalesOrderColumns ? (
          <>
            <td className="py-4 px-2 align-top text-sm whitespace-nowrap">
              {line.salesOrderReadableId ? (
                line.salesOrderId ? (
                  <Link
                    to={path.to.salesOrderDetails(line.salesOrderId)}
                    className="hover:underline"
                  >
                    {line.salesOrderReadableId}
                  </Link>
                ) : (
                  line.salesOrderReadableId
                )
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </td>
            <td className="py-4 px-2 align-top text-sm tabular-nums">
              {salesOrderLineLabel ?? "—"}
            </td>
            <td className="py-4 px-2 align-top text-sm whitespace-nowrap">
              {lineDueDate ? formatDate(lineDueDate) : "—"}
            </td>
          </>
        ) : null}

        <td className="py-4 px-2 align-top">
          <VStack spacing={1} className="min-w-0">
            <HStack spacing={1} className="items-center">
              {(isJobOverShipped || isOverInventory) && (
                <Tooltip>
                  <TooltipTrigger>
                    <LuCircleAlert className="size-3.5 text-red-500 shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {isOverInventory
                      ? t`Shipped quantity exceeds available inventory (${maxShippableQuantity})`
                      : t`Shipped quantity exceeds job quantity`}
                  </TooltipContent>
                </Tooltip>
              )}
              <NumberField
                value={displayedShippedQuantity}
                maxValue={maxShippableQuantity}
                onChange={(value) => {
                  const safeValue =
                    value == null || Number.isNaN(value) ? 0 : value;
                  setQuantityDraft(
                    Math.min(Math.max(0, safeValue), maxShippableQuantity)
                  );
                }}
                className="flex-1 min-w-0"
              >
                <NumberInput
                  className={cn(
                    "disabled:bg-transparent disabled:opacity-100 w-full",
                    (isJobOverShipped || isOverInventory) &&
                      "border-red-500 border-2"
                  )}
                  isDisabled={
                    isReadOnly ||
                    (line.fulfillment?.type === "Job" &&
                      (line.requiresSerialTracking ?? false))
                  }
                  size="sm"
                  min={0}
                  onBlur={() => {
                    if (quantityDraft !== null) {
                      commitShippedQuantity(quantityDraft);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              </NumberField>
            </HStack>
            {lineRequiresInventoryCheck(item, line.fulfillment?.type) &&
            !isReadOnly ? (
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                <Trans>On hand:</Trans> {formatQuantity(inventoryOnHand)}
              </span>
            ) : null}
          </VStack>
        </td>

        <td className="py-4 px-2 align-top text-sm tabular-nums">
          {line.orderQuantity || 0}
        </td>

        <td className="py-4 px-2 align-top">
          <HStack spacing={1}>
            <span className="text-sm tabular-nums">
              {(line.outstandingQuantity || 0) - (line.shippedQuantity || 0)}
            </span>
            {(line.shippedQuantity || 0) > (line.outstandingQuantity || 0) && (
              <Tooltip>
                <TooltipTrigger>
                  <LuCircleAlert className="size-3.5 text-red-500 shrink-0" />
                </TooltipTrigger>
                <TooltipContent>
                  There are more shipped than ordered
                </TooltipContent>
              </Tooltip>
            )}
          </HStack>
        </td>

        <td className="py-4 pr-6 pl-2 align-top">
          <HStack spacing={1} className="justify-end">
            {(line.shippedQuantity ?? 0) > 0 &&
            line.fulfillment?.type !== "Job" &&
            shipment?.id ? (
              <ShippingLabelPrintButton
                sourceDocumentId={shipment.id}
                locationId={shipment.locationId ?? undefined}
                lineId={line.id!}
                fileRoutes={{
                  pdf: path.to.file.shipmentShippingLabelPdf,
                  zpl: path.to.file.shipmentShippingLabelZpl
                }}
              />
            ) : null}
            {line.fulfillment?.type === "Job" ? (
              <VStack spacing={0} className="items-end">
                <span className="text-xs">Job</span>
                <span className="text-xs text-muted-foreground">
                  {line.fulfillment?.job?.jobId}
                </span>
              </VStack>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    aria-label={t`Line options`}
                    variant="secondary"
                    icon={<LuEllipsisVertical />}
                    size="md"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem
                    disabled={isReadOnly}
                    onClick={splitDisclosure.onOpen}
                  >
                    <DropdownMenuIcon icon={<LuSplit />} />
                    {t`Split shipment line`}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    destructive
                    disabled={isReadOnly}
                    onClick={deleteDisclosure.onOpen}
                  >
                    <DropdownMenuIcon icon={<LuTrash />} />
                    {t`Delete shipment line`}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </HStack>
        </td>
      </tr>

      {showDetails ? (
        <tr className={cn("border-b", className)}>
          <td colSpan={columnCount} className="px-6 pb-4 pt-0 align-top">
            <VStack spacing={4} className="w-full">
              {showStorageUnit ? (
                <StorageUnit
                  locationId={line.locationId}
                  storageUnitId={line.storageUnitId}
                  itemId={line.itemId}
                  isReadOnly={isReadOnly}
                  onChange={(storageUnit) => {
                    onUpdate({
                      lineId: line.id!,
                      field: "storageUnitId",
                      value: storageUnit
                    });
                  }}
                />
              ) : null}
              {line.requiresBatchTracking ? (
                <BatchForm
                  shipment={shipment}
                  line={line}
                  hasTrackingLabel={hasTrackingLabel}
                  isReadOnly={isReadOnly}
                  batchAssignments={batchAssignments}
                  onBatchAssignmentsChange={onBatchAssignmentsChange}
                  onUpdate={onUpdate}
                />
              ) : null}
              {line.requiresSerialTracking ? (
                <SerialForm
                  shipment={shipment}
                  line={line}
                  hasTrackingLabel={hasTrackingLabel}
                  serialNumbers={serialNumbers}
                  isReadOnly={isReadOnly}
                  onSerialNumbersChange={onSerialNumbersChange}
                />
              ) : null}
            </VStack>
          </td>
        </tr>
      ) : null}

      {splitDisclosure.isOpen && (
        <SplitShipmentLineModal line={line} onClose={splitDisclosure.onClose} />
      )}
      {deleteDisclosure.isOpen && (
        <ConfirmDelete
          name="Shipment Line"
          text="Are you sure you want to delete this shipment line?"
          action={path.to.shipmentLineDelete(line.id!)}
          onCancel={deleteDisclosure.onClose}
          onSubmit={deleteDisclosure.onClose}
        />
      )}
    </>
  );
}

function BatchForm({
  line,
  shipment,
  hasTrackingLabel,
  isReadOnly,
  batchAssignments,
  onBatchAssignmentsChange,
  onUpdate
}: {
  line: ShipmentLine;
  shipment?: Shipment;
  hasTrackingLabel: boolean;
  isReadOnly: boolean;
  batchAssignments: ShipmentBatchAssignment[];
  onBatchAssignmentsChange: (assignments: ShipmentBatchAssignment[]) => void;
  onUpdate: ({
    lineId,
    field,
    value
  }: {
    lineId: string;
    field: "storageUnitId";
    value: string;
  }) => Promise<void>;
}) {
  const { t } = useLingui();
  const { data: batchNumbers } = useBatchNumbers(line.itemId!);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const { carbon } = useCarbon();

  const shippedQuantity = line.shippedQuantity ?? 0;
  const assignedQuantity = batchAssignments.reduce(
    (sum, row) => sum + (row.quantity || 0),
    0
  );
  const remainingQuantity = Math.max(0, shippedQuantity - assignedQuantity);

  const updateRow = (
    index: number,
    patch: Partial<ShipmentBatchAssignment>
  ) => {
    onBatchAssignmentsChange(
      batchAssignments.map((row) =>
        row.index === index ? { ...row, ...patch } : row
      )
    );
  };

  const addBatchRow = () => {
    const nextIndex =
      batchAssignments.reduce((max, row) => Math.max(max, row.index), -1) + 1;
    onBatchAssignmentsChange([
      ...batchAssignments,
      {
        index: nextIndex,
        batchNumber: "",
        quantity: remainingQuantity
      }
    ]);
  };

  const clearBatchRow = async (index: number) => {
    if (!shipment?.id) return;

    const formData = new FormData();
    formData.append("shipmentId", shipment.id);
    formData.append("shipmentLineId", line.id!);
    formData.append("trackingType", "batch");
    formData.append("clearIndex", String(index));

    await fetch(path.to.shipmentLinesTracking(shipment.id), {
      method: "POST",
      body: formData
    });
  };

  const removeBatchRow = async (index: number) => {
    await clearBatchRow(index);
    const nextAssignments = batchAssignments.filter(
      (row) => row.index !== index
    );
    onBatchAssignmentsChange(
      nextAssignments.length > 0
        ? nextAssignments
        : [{ index: 0, batchNumber: "", quantity: 0 }]
    );
    setErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const commitBatchRow = async (row: ShipmentBatchAssignment) => {
    if (!shipment?.id) return;

    if (!row.batchNumber.trim()) {
      if (batchAssignments.length > 1) {
        await removeBatchRow(row.index);
      }
      return;
    }

    const batchNumber = resolveTrackedEntity(
      row.batchNumber.trim(),
      batchNumbers?.data ?? []
    );

    if (!batchNumber) {
      setErrors((prev) => ({
        ...prev,
        [row.index]: "Batch number not found"
      }));
      updateRow(row.index, { batchNumber: "" });
      return;
    }

    // @ts-expect-error TS2339 - TODO: fix type
    if (batchNumber.status !== "Available") {
      setErrors((prev) => ({
        ...prev,
        // @ts-expect-error TS2339 - TODO: fix type
        [row.index]: `Batch number is ${batchNumber.status}`
      }));
      updateRow(row.index, { batchNumber: "" });
      return;
    }

    const attributes = batchNumber.attributes as TrackedEntityAttributes;
    if (
      attributes["Shipment Line"] &&
      attributes["Shipment Line"] !== line.id &&
      attributes["Shipment"] === shipment.id
    ) {
      setErrors((prev) => ({
        ...prev,
        [row.index]: "Batch number is already used on another shipment line"
      }));
      updateRow(row.index, { batchNumber: "" });
      return;
    }

    const duplicateOnLine = batchAssignments.some((other) => {
      if (other.index === row.index || !other.batchNumber.trim()) return false;
      const otherBatch = resolveTrackedEntity(
        other.batchNumber.trim(),
        batchNumbers?.data ?? []
      );
      return otherBatch?.id === batchNumber.id;
    });

    if (duplicateOnLine) {
      setErrors((prev) => ({
        ...prev,
        [row.index]: "Batch number is already used on this line"
      }));
      updateRow(row.index, { batchNumber: "" });
      return;
    }

    const otherAssignedQuantity = batchAssignments
      .filter((assignment) => assignment.index !== row.index)
      .reduce((sum, assignment) => sum + (assignment.quantity || 0), 0);
    const rowRemaining = Math.max(0, shippedQuantity - otherAssignedQuantity);

    // @ts-expect-error TS2339 - TODO: fix type
    const batchAvailable = Number(batchNumber.quantity ?? 0);
    let quantity = row.quantity;

    if (quantity <= 0) {
      quantity = Math.min(rowRemaining, batchAvailable);
    }

    if (quantity <= 0) {
      setErrors((prev) => ({
        ...prev,
        [row.index]: "Quantity must be greater than zero"
      }));
      return;
    }

    if (quantity > batchAvailable) {
      setErrors((prev) => ({
        ...prev,
        [row.index]: `Quantity exceeds batch quantity (${batchAvailable})`
      }));
      return;
    }

    if (quantity > rowRemaining) {
      setErrors((prev) => ({
        ...prev,
        [row.index]: `Quantity exceeds remaining shipped quantity (${rowRemaining})`
      }));
      return;
    }

    if (quantity !== row.quantity) {
      updateRow(row.index, { quantity });
    }

    const formData = new FormData();
    formData.append("itemId", line.itemId!);
    formData.append("shipmentId", shipment.id);
    formData.append("shipmentLineId", line.id!);
    formData.append("trackingType", "batch");
    formData.append("trackedEntityId", batchNumber.id);
    formData.append("index", row.index.toString());
    formData.append("quantity", quantity.toString());

    try {
      const response = await fetch(path.to.shipmentLinesTracking(shipment.id), {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const responseData = await response.json().catch(() => null);
        setErrors((prev) => ({
          ...prev,
          [row.index]:
            responseData?.message ??
            responseData?.error ??
            "Failed to assign batch"
        }));
        return;
      }

      setErrors((prev) => {
        const next = { ...prev };
        delete next[row.index];
        return next;
      });

      if (carbon) {
        const ledger = await carbon
          .from("itemLedger")
          .select("storageUnitId")
          .eq("trackedEntityId", batchNumber.id)
          .order("createdAt", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ledger.data?.storageUnitId) {
          onUpdate({
            lineId: line.id!,
            field: "storageUnitId",
            value: ledger.data.storageUnitId
          });
        }
      }
    } catch {
      setErrors((prev) => ({
        ...prev,
        [row.index]: "Failed to assign batch"
      }));
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full p-6 border rounded-lg">
      <div className="flex justify-between items-center gap-4">
        <Heading size="h4">Tracking Number</Heading>
        {hasTrackingLabel && (
          <PrintButton
            sourceDocument="Shipment"
            sourceDocumentId={shipment?.id ?? ""}
            locationId={shipment?.locationId ?? undefined}
            context="shipping"
            fileRoutes={{
              pdf: (id, opts) =>
                path.to.file.shipmentLabelsPdf(id, {
                  ...opts,
                  lineId: line.id!
                }),
              zpl: (id, opts) =>
                path.to.file.shipmentLabelsZpl(id, {
                  ...opts,
                  lineId: line.id!
                })
            }}
          />
        )}
      </div>

      <VStack spacing={3} className="w-full">
        {batchAssignments.map((row) => {
          const resolvedBatch = row.batchNumber
            ? resolveTrackedEntity(row.batchNumber, batchNumbers?.data ?? [])
            : null;
          // @ts-expect-error TS2339 - TODO: fix type
          const isBatchNumberValid = resolvedBatch?.status === "Available";

          return (
            <div
              key={row.index}
              className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_8rem_auto] gap-3 items-start w-full"
            >
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground flex items-center gap-2">
                  <LuGroup /> <Trans>Batch Number</Trans>
                </label>
                <InputGroup isDisabled={isReadOnly}>
                  <Input
                    placeholder={t`Batch number`}
                    value={row.batchNumber}
                    onChange={(event) => {
                      updateRow(row.index, { batchNumber: event.target.value });
                    }}
                    onBlur={() => {
                      const current =
                        batchAssignments.find(
                          (assignment) => assignment.index === row.index
                        ) ?? row;
                      commitBatchRow(current);
                    }}
                    className={cn(errors[row.index] && "border-destructive")}
                  />
                  <InputRightElement className="pl-2">
                    {isBatchNumberValid ? (
                      <LuCheck className="text-emerald-500" />
                    ) : (
                      <LuQrCode />
                    )}
                  </InputRightElement>
                </InputGroup>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">
                  <Trans>Quantity</Trans>
                </label>
                <NumberField
                  value={row.quantity}
                  minValue={0}
                  onChange={(value) => {
                    const safeValue =
                      value == null || Number.isNaN(value) ? 0 : value;
                    updateRow(row.index, { quantity: safeValue });
                  }}
                  isDisabled={isReadOnly}
                >
                  <NumberInput
                    size="sm"
                    onBlur={() => {
                      const current =
                        batchAssignments.find(
                          (assignment) => assignment.index === row.index
                        ) ?? row;
                      commitBatchRow(current);
                    }}
                  />
                </NumberField>
              </div>

              {!isReadOnly && batchAssignments.length > 1 ? (
                <div className="flex items-end h-full pb-0.5">
                  <IconButton
                    aria-label={t`Remove batch`}
                    variant="secondary"
                    icon={<LuTrash />}
                    onClick={() => removeBatchRow(row.index)}
                  />
                </div>
              ) : (
                <div />
              )}

              {errors[row.index] ? (
                <span className="text-xs text-destructive lg:col-span-3">
                  {errors[row.index]}
                </span>
              ) : null}
            </div>
          );
        })}
      </VStack>

      {!isReadOnly && remainingQuantity > 0 ? (
        <Button
          type="button"
          variant="secondary"
          leftIcon={<LuCirclePlus />}
          onClick={addBatchRow}
        >
          {t`Add batch (${remainingQuantity} remaining)`}
        </Button>
      ) : null}

      {remainingQuantity > 0 && assignedQuantity > 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
          <LuInfo className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {t`Assign ${remainingQuantity} more from another batch to match the shipped quantity.`}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SerialForm({
  line,
  shipment,
  hasTrackingLabel,
  serialNumbers,
  isReadOnly,
  onSerialNumbersChange
}: {
  line: ShipmentLine;
  shipment?: Shipment;
  hasTrackingLabel: boolean;
  serialNumbers: { index: number; id: string }[];
  isReadOnly: boolean;
  onSerialNumbersChange: (
    serialNumbers: { index: number; id: string }[]
  ) => void;
}) {
  const [errors, setErrors] = useState<Record<number, string>>({});
  const { data: serialNumbersData } = useSerialNumbers(
    line.itemId!,
    isReadOnly
  );

  // Check for duplicates within the current form
  const validateSerialNumber = useCallback(
    (serialNumberId: string, currentIndex: number) => {
      if (!serialNumberId) return null;

      // Check for duplicates within the form (resolve both sides to entity id)
      const resolvedCurrent = resolveTrackedEntity(
        serialNumberId,
        serialNumbersData?.data ?? []
      );
      const isDuplicate = serialNumbers.some((sn, idx) => {
        if (idx === currentIndex || !sn.id) return false;
        const resolvedOther = resolveTrackedEntity(
          sn.id,
          serialNumbersData?.data ?? []
        );
        return (
          sn.id === serialNumberId ||
          (resolvedCurrent &&
            resolvedOther &&
            resolvedCurrent.id === resolvedOther.id)
        );
      });

      if (isDuplicate) {
        return "Duplicate serial number";
      }

      // Check if serial number is available (by id or readableId)
      const serialNumber = resolveTrackedEntity(
        serialNumberId,
        serialNumbersData?.data ?? []
      );

      if (!serialNumber) {
        return "Serial number not found";
      }

      // @ts-expect-error TS2339 - TODO: fix type
      if (serialNumber.status !== "Available") {
        // @ts-expect-error TS2339 - TODO: fix type
        return `Serial number is ${serialNumber.status}`;
      }

      return null;
    },
    [serialNumbers, serialNumbersData?.data]
  );

  const updateSerialNumber = useCallback(
    async (serialNumber: { index: number; id: string }) => {
      if (!shipment?.id || !serialNumber.id) return;

      const error = validateSerialNumber(serialNumber.id, serialNumber.index);
      if (error) {
        setErrors((prev) => ({ ...prev, [serialNumber.index]: error }));

        // Clear the input value but keep the error message
        const newSerialNumbers = [...serialNumbers];
        newSerialNumbers[serialNumber.index] = {
          index: serialNumber.index,
          id: ""
        };
        onSerialNumbersChange(newSerialNumbers);
        return;
      }

      // Resolve scanned value to actual tracked entity id
      const resolvedEntity = resolveTrackedEntity(
        serialNumber.id.trim(),
        serialNumbersData?.data ?? []
      );

      const formData = new FormData();
      formData.append("trackingType", "serial");
      formData.append("itemId", line.itemId!);
      formData.append("shipmentId", shipment.id);
      formData.append("shipmentLineId", line.id!);
      formData.append("index", serialNumber.index.toString());
      formData.append(
        "trackedEntityId",
        resolvedEntity?.id ?? serialNumber.id.trim()
      );

      try {
        const response = await fetch(
          path.to.shipmentLinesTracking(shipment.id),
          {
            method: "POST",
            body: formData
          }
        );

        if (response.ok) {
          // Clear error if submission was successful
          setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[serialNumber.index];
            return newErrors;
          });
        } else {
          const responseData = await response.json();
          const errorMessage =
            responseData.message || "Failed to track serial number";

          setErrors((prev) => ({
            ...prev,
            [serialNumber.index]: errorMessage
          }));

          // Clear the input value but keep the error message
          const newSerialNumbers = [...serialNumbers];
          newSerialNumbers[serialNumber.index] = {
            index: serialNumber.index,
            id: ""
          };
          onSerialNumbersChange(newSerialNumbers);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("available")) {
          setErrors((prev) => ({
            ...prev,
            [serialNumber.index]: "Serial number is not available"
          }));

          // Clear the input value but keep the error message
          const newSerialNumbers = [...serialNumbers];
          newSerialNumbers[serialNumber.index] = {
            index: serialNumber.index,
            id: ""
          };
          onSerialNumbersChange(newSerialNumbers);
        }
      }
    },
    [
      line.id,
      line.itemId,
      shipment?.id,
      validateSerialNumber,
      serialNumbers,
      serialNumbersData?.data,
      onSerialNumbersChange
    ]
  );

  return (
    <div className="flex flex-col gap-6 p-6 border rounded-lg">
      <div className="flex justify-between items-center gap-4">
        <Heading size="h4">Tracking Numbers</Heading>
        {hasTrackingLabel && (
          <PrintButton
            sourceDocument="Shipment"
            sourceDocumentId={shipment?.id ?? ""}
            locationId={shipment?.locationId ?? undefined}
            context="shipping"
            fileRoutes={{
              pdf: (id, opts) =>
                path.to.file.shipmentLabelsPdf(id, {
                  ...opts,
                  lineId: line.id!
                }),
              zpl: (id, opts) =>
                path.to.file.shipmentLabelsZpl(id, {
                  ...opts,
                  lineId: line.id!
                })
            }}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-4 gap-y-3">
        {serialNumbers.map((serialNumber, index) => {
          // Check if the serial number is valid and in the list
          const resolvedSerial = serialNumber.id
            ? resolveTrackedEntity(
                serialNumber.id,
                serialNumbersData?.data ?? []
              )
            : null;
          // @ts-expect-error TS2339 - TODO: fix type
          const isSerialNumberValid = resolvedSerial?.status === "Available";

          return (
            <div
              key={`${line.id}-${index}-serial`}
              className="flex flex-col gap-1"
            >
              <InputGroup isDisabled={isReadOnly}>
                <Input
                  placeholder={`Tracking Number ${index + 1}`}
                  value={serialNumber.id}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    const newSerialNumbers = [...serialNumbers];
                    newSerialNumbers[index] = {
                      index,
                      id: newValue
                    };
                    onSerialNumbersChange(newSerialNumbers);
                  }}
                  onBlur={(e) => {
                    const newValue = e.target.value;
                    const error = validateSerialNumber(newValue, index);

                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      if (error) {
                        newErrors[index] = error;
                      } else {
                        delete newErrors[index];
                      }
                      return newErrors;
                    });

                    if (!error) {
                      updateSerialNumber({
                        index,
                        id: newValue
                      });
                    } else {
                      // Clear the input value but keep the error message
                      const newSerialNumbers = [...serialNumbers];
                      newSerialNumbers[index] = {
                        index,
                        id: ""
                      };
                      onSerialNumbersChange(newSerialNumbers);
                    }
                  }}
                  className={cn(errors[index] && "border-destructive")}
                />
                <InputRightElement className="pl-2">
                  {isSerialNumberValid ? (
                    <LuCheck className="text-emerald-500" />
                  ) : (
                    <LuQrCode />
                  )}
                </InputRightElement>
              </InputGroup>
              {errors[index] && (
                <span className="text-xs text-destructive">
                  {errors[index]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SplitShipmentLineModal({
  line,
  onClose
}: {
  line: ShipmentLine;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const fetcher = useFetcher<{ success: boolean }>();
  useEffect(() => {
    if (fetcher.data?.success) {
      onClose();
    }
  }, [fetcher.data?.success, onClose]);

  return (
    <Modal open onOpenChange={onClose}>
      <ModalContent>
        <ValidatedForm
          method="post"
          action={path.to.shipmentLineSplit}
          validator={splitValidator}
          fetcher={fetcher}
        >
          <ModalHeader>
            <ModalTitle>Split Shipment Line</ModalTitle>
            <ModalDescription>
              Select the quantity that you'd like to split into a new line.
            </ModalDescription>
          </ModalHeader>

          <ModalBody>
            <input type="hidden" name="documentId" value={line.shipmentId!} />
            <input type="hidden" name="documentLineId" value={line.id!} />
            <input
              type="hidden"
              name="locationId"
              value={line.locationId ?? ""}
            />
            <FormNumber name="quantity" label={t`Quantity`} minValue={0.0001} />
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Submit>Split Line</Submit>
          </ModalFooter>
        </ValidatedForm>
      </ModalContent>
    </Modal>
  );
}

function StorageUnit({
  locationId,
  storageUnitId,
  itemId,
  isReadOnly,
  onChange
}: {
  locationId: string | null;
  storageUnitId: string | null;
  itemId: string | null;
  isReadOnly: boolean;
  onChange: (storageUnit: string) => void;
}) {
  const { options } = useStorageUnits(
    locationId ?? undefined,
    itemId ?? undefined
  );

  if (!locationId) return null;

  return (
    <VStack spacing={1} className="min-w-[140px] text-sm">
      <label className="text-xs text-muted-foreground">
        <Trans>Storage Unit</Trans>
      </label>
      <div className="py-1">
        <Combobox
          value={storageUnitId ?? undefined}
          onChange={(newValue) => {
            onChange(newValue);
          }}
          options={options}
          isReadOnly={isReadOnly}
          inline={(value, options) => {
            const option = options.find((o) => o.value === value);
            return option?.label ?? "";
          }}
        />
      </div>
    </VStack>
  );
}

const usePendingShipmentLines = () => {
  type PendingItem = ReturnType<typeof useFetchers>[number] & {
    formData: FormData;
  };

  const pendingByLineId = useFetchers()
    .filter((fetcher): fetcher is PendingItem => {
      return fetcher.formAction === path.to.bulkUpdateShipmentLine;
    })
    .reduce((map, fetcher) => {
      const lineId = fetcher.formData.get("ids") as string;
      const field = fetcher.formData.get("field") as string;
      const value = fetcher.formData.get("value") as string;

      if (!lineId || !field) {
        return map;
      }

      const existing = map.get(lineId) ?? { id: lineId };
      if (field === "shippedQuantity") {
        if (value === null || value === "") return map;
        map.set(lineId, {
          ...existing,
          shippedQuantity: Number(value)
        });
      } else if (field === "storageUnitId") {
        map.set(lineId, {
          ...existing,
          storageUnitId: value || null
        });
      }

      return map;
    }, new Map<
      string,
      { id: string; shippedQuantity?: number; storageUnitId?: string | null }
    >());

  return Array.from(pendingByLineId.values());
};

function resolveTrackedEntity(
  scannedValue: string,
  entities: { id: string; readableId: string | null }[]
) {
  return (
    entities.find((e) => e.id === scannedValue) ??
    entities.find((e) => e.readableId === scannedValue) ??
    null
  );
}

function formatQuantity(value: number | null | undefined): string {
  if (value == null || typeof value !== "number" || !isFinite(value)) {
    return "—";
  }
  return value % 1 === 0
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function getInventoryOnHand(
  itemId: string | null | undefined,
  locationId: string | undefined,
  items: Item[],
  liveOnHandByItemId?: Record<string, number>
): { quantity: number; unitOfMeasureCode: string } | null {
  if (!itemId) return null;
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return null;

  const quantity =
    liveOnHandByItemId && itemId in liveOnHandByItemId
      ? liveOnHandByItemId[itemId]!
      : locationId != null
        ? (item.quantityByLocation?.[locationId] ?? 0)
        : (item.quantityOnHand ?? 0);

  return {
    quantity,
    unitOfMeasureCode: item.unitOfMeasureCode
  };
}

function lineRequiresInventoryCheck(
  item: Item | undefined,
  fulfillmentType?: string | null
) {
  return shipmentLineRequiresInventoryCheck(
    item?.itemTrackingType,
    fulfillmentType
  );
}

function getReservedShipmentQuantityForItemClient(
  shipmentLines: ShipmentLine[],
  itemId: string | null | undefined,
  excludeLineId?: string | null
) {
  if (!itemId) return 0;
  return shipmentLines
    .filter((line) => line.itemId === itemId && line.id !== excludeLineId)
    .reduce((sum, line) => sum + (line.shippedQuantity ?? 0), 0);
}

function getPendingAddLineDemandForItem(
  availableLines: AvailableShipmentLine[],
  selectedLineIds: Set<string>,
  itemId: string | null | undefined,
  excludeLineId?: string
) {
  if (!itemId) return 0;
  return availableLines
    .filter(
      (line) =>
        line.itemId === itemId &&
        line.id !== excludeLineId &&
        selectedLineIds.has(line.id)
    )
    .reduce((sum, line) => sum + (line.quantityToSend ?? 0), 0);
}

function getMaxShippableQuantityClient({
  itemId,
  item,
  fulfillmentType,
  locationId,
  items,
  outstandingQuantity,
  shipmentLines,
  currentLineId,
  pendingSelectionDemand = 0,
  liveOnHandByItemId,
  skipInventoryCap = false
}: {
  itemId: string | null | undefined;
  item: Item | undefined;
  fulfillmentType?: string | null;
  locationId?: string;
  items: Item[];
  outstandingQuantity: number;
  shipmentLines: ShipmentLine[];
  currentLineId?: string | null;
  pendingSelectionDemand?: number;
  liveOnHandByItemId?: Record<string, number>;
  /** Posted shipments already reduced on-hand; don't re-apply caps. */
  skipInventoryCap?: boolean;
}) {
  if (skipInventoryCap || !lineRequiresInventoryCheck(item, fulfillmentType)) {
    return outstandingQuantity;
  }

  const onHand =
    getInventoryOnHand(itemId, locationId, items, liveOnHandByItemId)
      ?.quantity ?? 0;
  const reservedQuantity = getReservedShipmentQuantityForItemClient(
    shipmentLines,
    itemId,
    currentLineId
  );
  const availableInventory = Math.max(
    0,
    onHand - reservedQuantity - pendingSelectionDemand
  );
  return Math.min(outstandingQuantity, availableInventory);
}

function isAvailableLineShippable(
  line: AvailableShipmentLine,
  items: Item[],
  locationId: string | undefined,
  shipmentLines: ShipmentLine[],
  selectedLineIds: Set<string>,
  availableLines: AvailableShipmentLine[],
  liveOnHandByItemId?: Record<string, number>
) {
  const item = items.find((entry) => entry.id === line.itemId);
  if (!lineRequiresInventoryCheck(item)) {
    return true;
  }

  const maxShippable = getMaxShippableQuantityClient({
    itemId: line.itemId,
    item,
    locationId,
    items,
    outstandingQuantity: line.quantityToSend ?? 0,
    shipmentLines,
    pendingSelectionDemand: getPendingAddLineDemandForItem(
      availableLines,
      selectedLineIds,
      line.itemId,
      line.id
    ),
    liveOnHandByItemId
  });

  return maxShippable > 0;
}

function getAddLineItemPartLabel(
  line: AvailableShipmentLine,
  items: Item[],
  showCustomerPartNumbers: boolean,
  customerParts?: CustomerPartMapping[]
): string {
  const internal = getItemReadableId(items, line.itemId) ?? line.itemId ?? "";
  if (!showCustomerPartNumbers || !line.itemId || !customerParts?.length) {
    return internal;
  }
  const mapping = customerParts.find((cp) => cp.itemId === line.itemId);
  return mapping ? customerPartNumberLabel(mapping) : internal;
}

function AddShipmentLineTableRow({
  line,
  items,
  locationId,
  liveOnHandByItemId,
  isSelected,
  isShippable,
  onToggle,
  formatDate,
  showCustomerPartNumbers,
  customerParts
}: {
  line: AvailableShipmentLine;
  items: Item[];
  locationId?: string;
  liveOnHandByItemId?: Record<string, number>;
  isSelected: boolean;
  isShippable: boolean;
  onToggle: () => void;
  formatDate: (value: string) => string;
  showCustomerPartNumbers: boolean;
  customerParts?: CustomerPartMapping[];
}) {
  const qtyDue = line.quantityToSend ?? 0;
  const qtySent = line.quantitySent ?? 0;
  const qtyOrdered = line.saleQuantity ?? 0;
  const inventory = getInventoryOnHand(
    line.itemId,
    locationId,
    items,
    liveOnHandByItemId
  );
  const uom = line.unitOfMeasureCode ?? inventory?.unitOfMeasureCode ?? "";

  return (
    <tr
      className={cn(
        "border-b last:border-b-0",
        isShippable
          ? "cursor-pointer hover:bg-muted/50"
          : "opacity-60 cursor-not-allowed"
      )}
      onClick={isShippable ? onToggle : undefined}
    >
      <td
        className="py-2.5 pl-1 align-top"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          isChecked={isSelected}
          disabled={!isShippable}
          onCheckedChange={onToggle}
        />
      </td>
      <td className="py-2.5 pr-2 align-top text-sm font-medium whitespace-nowrap">
        {line.salesOrderReadableId ?? line.salesOrderId}
      </td>
      <td className="py-2.5 pr-3 align-top min-w-0">
        <div className="min-w-0 text-sm text-muted-foreground">
          <div className="truncate">
            {getAddLineItemPartLabel(
              line,
              items,
              showCustomerPartNumbers,
              customerParts
            )}
          </div>
          {line.description ? (
            <div className="text-xs truncate">{line.description}</div>
          ) : null}
        </div>
      </td>
      <td className="py-2.5 px-2 align-top text-sm text-muted-foreground whitespace-nowrap">
        {line.promisedDate ? formatDate(line.promisedDate) : "—"}
      </td>
      <td className="py-2.5 px-2 align-top text-right tabular-nums text-sm whitespace-nowrap">
        <div className="font-medium">
          {formatQuantity(qtyDue)}
          {uom ? ` ${uom}` : ""}
        </div>
        {qtySent > 0 ? (
          <div className="text-xs text-muted-foreground">
            {formatQuantity(qtySent)} of {formatQuantity(qtyOrdered)}{" "}
            <Trans>shipped</Trans>
          </div>
        ) : null}
      </td>
      <td className="py-2.5 pr-1 align-top text-right tabular-nums text-sm whitespace-nowrap">
        {inventory ? (
          <span className={cn(!isShippable && "text-destructive")}>
            {formatQuantity(inventory.quantity)} {inventory.unitOfMeasureCode}
          </span>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

function AddShipmentLineCard({
  line,
  items,
  locationId,
  liveOnHandByItemId,
  isSelected,
  isShippable,
  onToggle,
  formatDate,
  showCustomerPartNumbers,
  customerParts
}: {
  line: AvailableShipmentLine;
  items: Item[];
  locationId?: string;
  liveOnHandByItemId?: Record<string, number>;
  isSelected: boolean;
  isShippable: boolean;
  onToggle: () => void;
  formatDate: (value: string) => string;
  showCustomerPartNumbers: boolean;
  customerParts?: CustomerPartMapping[];
}) {
  const qtyDue = line.quantityToSend ?? 0;
  const qtySent = line.quantitySent ?? 0;
  const qtyOrdered = line.saleQuantity ?? 0;
  const inventory = getInventoryOnHand(
    line.itemId,
    locationId,
    items,
    liveOnHandByItemId
  );
  const uom = line.unitOfMeasureCode ?? inventory?.unitOfMeasureCode ?? "";

  return (
    <label
      className={cn(
        "flex gap-3 w-full rounded-lg border mb-2 last:mb-0 p-3",
        isShippable
          ? "cursor-pointer hover:bg-muted/50"
          : "opacity-60 cursor-not-allowed"
      )}
    >
      <Checkbox
        isChecked={isSelected}
        disabled={!isShippable}
        onCheckedChange={onToggle}
      />
      <VStack spacing={0} className="min-w-0 flex-1">
        <div className="min-w-0 text-sm">
          <div className="font-medium">
            {line.salesOrderReadableId ?? line.salesOrderId}
          </div>
          <div className="text-muted-foreground truncate">
            {getAddLineItemPartLabel(
              line,
              items,
              showCustomerPartNumbers,
              customerParts
            )}
          </div>
        </div>
        {line.description ? (
          <span className="text-xs text-muted-foreground truncate">
            {line.description}
          </span>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
          <span>
            <Trans>Promised:</Trans>{" "}
            {line.promisedDate ? formatDate(line.promisedDate) : "—"}
          </span>
          <span>
            <Trans>Qty due:</Trans> {formatQuantity(qtyDue)}
            {uom ? ` ${uom}` : ""}
            {qtySent > 0 ? (
              <span className="text-muted-foreground/80">
                {" "}
                ({formatQuantity(qtySent)} of {formatQuantity(qtyOrdered)}{" "}
                <Trans>shipped</Trans>)
              </span>
            ) : null}
          </span>
          <span>
            <Trans>On hand:</Trans>{" "}
            {inventory ? (
              <span className={cn(!isShippable && "text-destructive")}>
                {formatQuantity(inventory.quantity)}{" "}
                {inventory.unitOfMeasureCode}
              </span>
            ) : (
              "—"
            )}
          </span>
        </div>
      </VStack>
    </label>
  );
}

function AddLineSortHeader({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "left"
}: {
  label: ReactNode;
  column: AddLineSortColumn;
  activeColumn: AddLineSortColumn;
  direction: "asc" | "desc";
  onSort: (column: AddLineSortColumn) => void;
  align?: "left" | "right";
}) {
  const isActive = activeColumn === column;
  const SortIcon = isActive
    ? direction === "asc"
      ? LuArrowUp
      : LuArrowDown
    : LuArrowUpDown;

  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 text-inherit uppercase hover:text-foreground transition-colors",
        align === "right" && "w-full justify-end"
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSort(column);
      }}
    >
      <span>{label}</span>
      <SortIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
    </button>
  );
}

function compareAddShipmentLines(
  a: AvailableShipmentLine,
  b: AvailableShipmentLine,
  column: AddLineSortColumn,
  direction: "asc" | "desc",
  items: Item[],
  locationId?: string,
  customerParts?: CustomerPartMapping[],
  liveOnHandByItemId?: Record<string, number>
): number {
  const factor = direction === "asc" ? 1 : -1;
  const showCustomerPartNumbers = !!customerParts?.length;

  switch (column) {
    case "order": {
      const aLabel = a.salesOrderReadableId ?? a.salesOrderId;
      const bLabel = b.salesOrderReadableId ?? b.salesOrderId;
      return aLabel.localeCompare(bLabel) * factor;
    }
    case "item": {
      const aLabel = getAddLineItemPartLabel(
        a,
        items,
        showCustomerPartNumbers,
        customerParts
      );
      const bLabel = getAddLineItemPartLabel(
        b,
        items,
        showCustomerPartNumbers,
        customerParts
      );
      return aLabel.localeCompare(bLabel) * factor;
    }
    case "promised": {
      const aDate = a.promisedDate ?? "";
      const bDate = b.promisedDate ?? "";
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1 * factor;
      if (!bDate) return -1 * factor;
      return aDate.localeCompare(bDate) * factor;
    }
    case "qtyDue":
      return ((a.quantityToSend ?? 0) - (b.quantityToSend ?? 0)) * factor;
    case "onHand": {
      const aQty =
        getInventoryOnHand(a.itemId, locationId, items, liveOnHandByItemId)
          ?.quantity ?? 0;
      const bQty =
        getInventoryOnHand(b.itemId, locationId, items, liveOnHandByItemId)
          ?.quantity ?? 0;
      return (aQty - bQty) * factor;
    }
    default:
      return 0;
  }
}

export default ShipmentLines;

export function useSerialNumbers(itemId?: string, isReadOnly = false) {
  const serialNumbersFetcher =
    useFetcher<Awaited<ReturnType<typeof getSerialNumbersForItem>>>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  useEffect(() => {
    if (itemId) {
      serialNumbersFetcher.load(path.to.api.serialNumbers(itemId, isReadOnly));
    }
  }, [itemId]);

  return { data: serialNumbersFetcher.data };
}

export function useBatchNumbers(itemId?: string) {
  const batchNumbersFetcher =
    useFetcher<Awaited<ReturnType<typeof getBatchNumbersForItem>>>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  useEffect(() => {
    if (itemId) {
      batchNumbersFetcher.load(path.to.api.batchNumbers(itemId));
    }
  }, [itemId]);

  return { data: batchNumbersFetcher.data };
}
