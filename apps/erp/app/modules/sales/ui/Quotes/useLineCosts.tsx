import {
  computeInsideOperationCostEffects,
  costingQuantityMultiplier,
  normalizeOperatorAttention,
  normalizeTimeToHours
} from "@carbon/utils";
import { useCallback, useMemo } from "react";
import { useParams } from "react-router";
import type { Tree } from "~/components/TreeView";
import { lookupBuyPriceFromMap, type SupplierPriceMap } from "~/modules/shared";
import type {
  CostEffects,
  Costs,
  QuotationLine,
  QuotationOperation,
  QuoteMethod
} from "../../types";

const defaultEffects: CostEffects = {
  consumableCost: [],
  laborCost: [],
  laborHours: [],
  machineCost: [],
  machineHours: [],
  materialCost: [],
  outsideCost: [],
  overheadCost: [],
  partCost: [],
  serviceCost: [],
  setupHours: [],
  toolCost: []
};

type EnhancedTree = Tree<QuoteMethod & { operations?: QuotationOperation[] }>;

export function useLineCosts({
  methodTree: originalMethodTree,
  operations,
  line,
  supplierPriceMap = {}
}: {
  methodTree?: Tree<QuoteMethod>;
  operations: QuotationOperation[];
  line: QuotationLine;
  supplierPriceMap?: SupplierPriceMap;
}): (quantity: number) => Costs {
  const { quoteId, lineId } = useParams();
  if (!quoteId) throw new Error("Could not find quoteId");
  if (!lineId) throw new Error("Could not find lineId");

  // TODO: instead of walking the tree twice (once for the quantities/operations and once for the effects)
  // we could do it all in one pass

  const methodTree = useMemo<EnhancedTree | undefined>(() => {
    if (!originalMethodTree || !originalMethodTree.id) {
      return undefined;
    }

    const tree = structuredClone(originalMethodTree);

    function traverseTree(tree: EnhancedTree, parentQuantity: number) {
      // multiply quantity by parent quantity
      tree.data.quantity = tree.data.quantity * parentQuantity;
      tree.data.operations = operations.filter(
        (o) => o.quoteMakeMethodId === tree.data.quoteMaterialMakeMethodId
      );

      if (tree.children) {
        for (const child of tree.children) {
          traverseTree(child, tree.data.quantity);
        }
      }
    }

    traverseTree(tree, 1);

    return tree;
  }, [operations, originalMethodTree]);

  const costEffects = useMemo<CostEffects>(() => {
    const effects = structuredClone(defaultEffects);

    function pushBuyCostEffect(
      itemId: string,
      itemType: string,
      quantity: number,
      unitCost: number,
      supplierPriceMap: SupplierPriceMap
    ) {
      const costFn = (outerQty: number) => {
        const requestedQty = quantity * outerQty;
        const resolved = lookupBuyPriceFromMap(
          itemId,
          requestedQty,
          supplierPriceMap,
          unitCost
        );
        return resolved * requestedQty;
      };
      switch (itemType) {
        case "Material":
          effects.materialCost.push(costFn);
          break;
        case "Part":
          effects.partCost.push(costFn);
          break;
        case "Tool":
          effects.toolCost.push(costFn);
          break;
        case "Consumable":
          effects.consumableCost.push(costFn);
          break;
        case "Service":
          effects.serviceCost.push(costFn);
          break;
        default:
          break;
      }
    }

    function walkTree(tree: EnhancedTree) {
      const { data } = tree;

      if (data.methodType === "Purchase to Order") {
        pushBuyCostEffect(
          data.itemId,
          data.itemType,
          data.quantity,
          data.unitCost,
          supplierPriceMap
        );
      } else if (data.methodType === "Pull from Inventory") {
        // Pick items use static average cost
        const costFn = (quantity: number) =>
          data.unitCost * data.quantity * quantity;
        switch (data.itemType) {
          case "Material":
            effects.materialCost.push(costFn);
            break;
          case "Part":
            effects.partCost.push(costFn);
            break;
          case "Tool":
            effects.toolCost.push(costFn);
            break;
          case "Consumable":
            effects.consumableCost.push(costFn);
            break;
          case "Service":
            effects.serviceCost.push(costFn);
            break;
          default:
            break;
        }
      }

      data.operations?.forEach((operation: QuotationOperation) => {
        if (operation.operationType === "Inside") {
          const opEffects = computeInsideOperationCostEffects({
            op: {
              setupTime: operation.setupTime,
              setupUnit: operation.setupUnit,
              machineTime: operation.machineTime,
              machineUnit: operation.machineUnit,
              operatorAttention: operation.operatorAttention,
              setupRate: operation.setupRate,
              laborRate: operation.laborRate,
              machineRate: operation.machineRate,
              overheadRate: operation.overheadRate,
              partsPerCycle: operation.partsPerCycle,
              timeBasis: operation.timeBasis
            },
            nodeQuantity: data.quantity
          });

          if (operation.setupTime) {
            const { fixedHours, hoursPerUnit } = normalizeTimeToHours(
              operation.setupTime,
              operation.setupUnit
            );
            effects.setupHours.push((quantity) => {
              const mult = costingQuantityMultiplier({
                quotePartQuantity: quantity,
                nodeQuantity: data.quantity,
                partsPerCycle: operation.partsPerCycle,
                timeBasis: operation.timeBasis
              });
              return hoursPerUnit * mult + fixedHours;
            });
          }

          if (operation.machineTime) {
            const machineNormalized = normalizeTimeToHours(
              operation.machineTime,
              operation.machineUnit
            );
            effects.machineHours.push((quantity) => {
              const mult = costingQuantityMultiplier({
                quotePartQuantity: quantity,
                nodeQuantity: data.quantity,
                partsPerCycle: operation.partsPerCycle,
                timeBasis: operation.timeBasis
              });
              return (
                machineNormalized.hoursPerUnit * mult +
                machineNormalized.fixedHours
              );
            });
            effects.laborHours.push((quantity) => {
              const mult = costingQuantityMultiplier({
                quotePartQuantity: quantity,
                nodeQuantity: data.quantity,
                partsPerCycle: operation.partsPerCycle,
                timeBasis: operation.timeBasis
              });
              const runHours =
                machineNormalized.hoursPerUnit * mult +
                machineNormalized.fixedHours;
              return (
                runHours *
                normalizeOperatorAttention(operation.operatorAttention)
              );
            });
          }

          effects.laborCost.push((quantity) => opEffects.setupCost(quantity));
          effects.laborCost.push((quantity) => opEffects.laborCost(quantity));
          effects.machineCost.push((quantity) =>
            opEffects.machineCost(quantity)
          );
          effects.overheadCost.push((quantity) =>
            opEffects.overheadCost(quantity)
          );
        } else if (operation.operationType === "Outside") {
          effects.outsideCost.push((quantity) => {
            const unitCost =
              operation.operationUnitCost * data.quantity * quantity;
            return Math.max(operation.operationMinimumCost, unitCost);
          });
        }
      });

      if (tree.children) {
        for (const child of tree.children) {
          walkTree(child);
        }
      }
    }

    if (methodTree && line.methodType === "Make to Order") {
      walkTree(methodTree);
    } else if (line.methodType === "Purchase to Order") {
      pushBuyCostEffect(
        line.itemId ?? "",
        "Material",
        1,
        line.unitCost ?? 0,
        supplierPriceMap
      );
    } else {
      effects.materialCost.push((quantity) => (line.unitCost ?? 0) * quantity);
    }

    return effects;
  }, [
    methodTree,
    line.methodType,
    line.unitCost,
    line.itemId,
    supplierPriceMap
  ]);

  const getCosts = useCallback(
    (quantity: number) => {
      const materialCost = costEffects.materialCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const partCost = costEffects.partCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const toolCost = costEffects.toolCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const consumableCost = costEffects.consumableCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const serviceCost = costEffects.serviceCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const laborCost = costEffects.laborCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const overheadCost = costEffects.overheadCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const outsideCost = costEffects.outsideCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const setupHours = costEffects.setupHours.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const laborHours = costEffects.laborHours.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const machineCost = costEffects.machineCost.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      const machineHours = costEffects.machineHours.reduce(
        (acc, effect) => acc + effect(quantity),
        0
      );

      return {
        consumableCost,
        laborCost,
        laborHours,
        machineCost,
        machineHours,
        materialCost,
        outsideCost,
        overheadCost,
        partCost,
        serviceCost,
        setupHours,
        toolCost
      };
    },
    [costEffects]
  );

  return getCosts;
}
