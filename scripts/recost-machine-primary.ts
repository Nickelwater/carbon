/**
 * Post-migration recost for machine-primary operations.
 *
 * Recalculates open quote line prices and item unit costs using the new
 * setupRate + operatorAttention costing model.
 *
 * Usage:
 *   COMPANY_ID=... USER_ID=... pnpm exec tsx scripts/recost-machine-primary.ts
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE in .env (or environment).
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { pluckUnique } from "@carbon/utils";
import { flattenTree } from "../apps/erp/app/components/TreeView";
import { getMethodTree } from "../apps/erp/app/modules/items";
import {
  calculateMadePartCosts,
  resolveOperationRates,
  type BomOperation,
  type WorkCenterRate
} from "../apps/erp/app/utils/bom";

config();

const companyId = process.env.COMPANY_ID;
const userId = process.env.USER_ID;

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE");
  process.exit(1);
}

if (!companyId || !userId) {
  console.error("Missing COMPANY_ID or USER_ID");
  process.exit(1);
}

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const RECOST_QUOTE_STATUSES = ["Draft", "Sent"] as const;

async function recostItem(itemId: string): Promise<boolean> {
  const makeMethodResult = await client
    .from("activeMakeMethods")
    .select("id")
    .eq("itemId", itemId)
    .maybeSingle();

  if (!makeMethodResult.data?.id) {
    return false;
  }

  const methodTree = await getMethodTree(client, makeMethodResult.data.id);
  if (methodTree.error || !methodTree.data) {
    console.error(`  item ${itemId}: method tree error`, methodTree.error);
    return false;
  }

  const methods =
    methodTree.data.length > 0 ? flattenTree(methodTree.data[0]) : [];
  if (methods.length === 0) return false;

  const makeMethodIds = pluckUnique(methods, (m) => m.data.makeMethodId);
  const itemIds = pluckUnique(methods, (m) => m.data.itemId);

  const [methodOperations, workCentersResult, lotSizesResult] =
    await Promise.all([
      client
        .from("methodOperation")
        .select(
          "*, ...process(processName:name), ...workCenter(workCenterName:name, setupRate, laborRate, machineRate, overheadRate)"
        )
        .in("makeMethodId", makeMethodIds)
        .eq("companyId", companyId),
      client
        .from("workCenters")
        .select("id, active, setupRate, laborRate, machineRate, overheadRate, processes")
        .eq("companyId", companyId),
      client
        .from("itemReplenishment")
        .select("itemId, lotSize")
        .in("itemId", itemIds)
    ]);

  const lotSizesByItemId = new Map(
    (lotSizesResult.data ?? []).map((r) => [r.itemId, r.lotSize ?? 1])
  );

  const workCenters: WorkCenterRate[] = (workCentersResult.data ?? []).map(
    (wc) => ({
      id: wc.id!,
      active: wc.active ?? false,
      setupRate: wc.setupRate,
      laborRate: wc.laborRate,
      machineRate: wc.machineRate,
      overheadRate: wc.overheadRate,
      processes: wc.processes
    })
  );

  const operationsByMakeMethodId: Record<string, typeof methodOperations.data> =
    {};
  for (const operation of methodOperations.data ?? []) {
    operationsByMakeMethodId[operation.makeMethodId] = [
      ...(operationsByMakeMethodId[operation.makeMethodId] ?? []),
      operation
    ];
  }

  const bomOperationsByKey: Record<string, BomOperation[]> = {};
  for (const [key, ops] of Object.entries(operationsByMakeMethodId)) {
    bomOperationsByKey[key] = ops.map((op) => {
      const rates = resolveOperationRates(
        op.workCenterId,
        op.processId,
        op.setupRate,
        op.laborRate,
        op.machineRate,
        op.overheadRate,
        workCenters
      );
      return {
        operationType: op.operationType,
        setupTime: op.setupTime,
        setupUnit: op.setupUnit,
        machineTime: op.machineTime,
        machineUnit: op.machineUnit,
        operatorAttention: op.operatorAttention,
        operationUnitCost: op.operationUnitCost,
        operationMinimumCost: op.operationMinimumCost,
        partsPerCycle: op.partsPerCycle,
        timeBasis: op.timeBasis,
        ...rates
      };
    });
  }

  const computedCosts = calculateMadePartCosts(
    methods,
    bomOperationsByKey,
    (node) => node.data.materialMakeMethodId,
    lotSizesByItemId
  );

  const rootNode = methods[0];
  const unitCost = computedCosts.get(rootNode.id) ?? 0;

  const { error } = await client
    .from("item")
    .update({ unitCost, updatedBy: userId })
    .eq("id", itemId)
    .eq("companyId", companyId);

  if (error) {
    console.error(`  item ${itemId}: update error`, error);
    return false;
  }

  return true;
}

async function recostQuoteLine(quoteId: string, quoteLineId: string) {
  const { recalculateQuoteLinePrices } = await import(
    "../apps/erp/app/modules/sales/sales.service"
  );
  const result = await recalculateQuoteLinePrices(
    client,
    quoteId,
    quoteLineId,
    userId
  );
  if (result.error) {
    console.error(`  line ${quoteLineId}:`, result.error);
    return false;
  }
  return true;
}

(async () => {
  console.log("Recosting items with active make methods…");
  const { data: makeItems } = await client
    .from("activeMakeMethods")
    .select("itemId")
    .eq("companyId", companyId);

  const itemIds = [...new Set((makeItems ?? []).map((r) => r.itemId))];
  let itemsOk = 0;
  for (const itemId of itemIds) {
    if (await recostItem(itemId)) itemsOk++;
  }
  console.log(`Items recosted: ${itemsOk}/${itemIds.length}`);

  console.log("Recosting open quote lines…");
  const { data: quotes } = await client
    .from("quote")
    .select("id")
    .eq("companyId", companyId)
    .in("status", [...RECOST_QUOTE_STATUSES]);

  const quoteIds = (quotes ?? []).map((q) => q.id);
  if (quoteIds.length === 0) {
    console.log("No open quotes found.");
    return;
  }

  const { data: lines } = await client
    .from("quoteLine")
    .select("id, quoteId, methodType")
    .in("quoteId", quoteIds)
    .eq("methodType", "Make to Order");

  let linesOk = 0;
  for (const line of lines ?? []) {
    const hasPrices = await client
      .from("quoteLinePrice")
      .select("id")
      .eq("quoteLineId", line.id)
      .limit(1);
    if (!hasPrices.data?.length) continue;

    if (await recostQuoteLine(line.quoteId, line.id)) linesOk++;
  }
  console.log(`Quote lines recosted: ${linesOk}/${lines?.length ?? 0}`);
})();
