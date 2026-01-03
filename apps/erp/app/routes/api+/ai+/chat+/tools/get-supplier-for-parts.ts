import { getAppUrl } from "@carbon/auth";
import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tool } from "ai";
import { LuSearch } from "react-icons/lu";
import { z } from "zod";
import { path } from "~/utils/path";
import type { ChatContext } from "../agents/shared/context";
import type { ToolConfig } from "../agents/shared/tools";

export const config: ToolConfig = {
  name: "getSupplierForParts",
  icon: LuSearch,
  displayText: "Getting Supplier for Parts",
  message: "Searching for suppliers for parts..."
};

export const getSupplierForPartsSchema = z.object({
  partIds: z.array(z.string())
});

export const getSupplierForPartsTool = tool({
  description: "Suggest a list of suppliers for a given list of parts",
  inputSchema: getSupplierForPartsSchema,
  execute: async function (args, executionOptions) {
    const context = executionOptions.experimental_context as ChatContext;
    console.log("[getSupplierForPartsTool]", args);
    return await getSuppliersForParts(context.client, args.partIds, context);
  }
});

export async function getSuppliersForParts(
  client: SupabaseClient<Database>,
  partIds: string[],
  context: { companyId: string }
) {
  // Find suppliers that provide these parts
  const [supplierParts, preferredSuppliers] = await Promise.all([
    client
      .from("supplierPart")
      .select("itemId, supplierId, unitPrice, supplierUnitOfMeasureCode")
      .in("itemId", partIds)
      .eq("companyId", context.companyId),
    client
      .from("itemReplenishment")
      .select("itemId, preferredSupplierId")
      .in("itemId", partIds)
      .eq("companyId", context.companyId)
  ]);

  if (partIds.length === 1) {
    const preferredSupplier = preferredSuppliers.data?.find(
      (p) => p.itemId === partIds[0]
    );
    if (preferredSupplier && preferredSupplier.preferredSupplierId) {
      return {
        id: preferredSupplier.preferredSupplierId
      };
    }

    const firstSupplier = supplierParts.data?.find(
      (p) => p.itemId === partIds[0]
    );
    if (firstSupplier) {
      return {
        link: `${getAppUrl()}${path.to.supplier(firstSupplier.supplierId)}`,
        id: firstSupplier.supplierId
      };
    }
  }

  // Count occurrences of each supplier in preferred suppliers
  const preferredSupplierCounts =
    preferredSuppliers.data?.reduce(
      (counts, item) => {
        if (item.preferredSupplierId) {
          counts[item.preferredSupplierId] =
            (counts[item.preferredSupplierId] || 0) + 1;
        }
        return counts;
      },
      {} as Record<string, number>
    ) || {};

  // Find the most frequent preferred supplier
  let mostFrequentPreferredSupplierId: string | null = null;
  let maxPreferredCount = 0;

  for (const [supplierId, count] of Object.entries(preferredSupplierCounts)) {
    if (count > maxPreferredCount) {
      maxPreferredCount = count;
      mostFrequentPreferredSupplierId = supplierId;
    }
  }

  // If we found a preferred supplier, return it
  if (mostFrequentPreferredSupplierId) {
    return {
      link: `${getAppUrl()}${path.to.supplier(
        mostFrequentPreferredSupplierId
      )}`,
      id: mostFrequentPreferredSupplierId
    };
  }

  // If no preferred supplier, count occurrences in supplierParts
  const supplierPartCounts =
    supplierParts.data?.reduce(
      (counts, item) => {
        if (item.supplierId) {
          counts[item.supplierId] = (counts[item.supplierId] || 0) + 1;
        }
        return counts;
      },
      {} as Record<string, number>
    ) || {};

  // Find the most frequent supplier from supplierParts
  let mostFrequentSupplierId: string | null = null;
  let maxCount = 0;

  for (const [supplierId, count] of Object.entries(supplierPartCounts)) {
    if (count > maxCount) {
      maxCount = count;
      mostFrequentSupplierId = supplierId;
    }
  }

  // Return the most frequent supplier if found
  if (mostFrequentSupplierId) {
    const supplier = supplierParts.data?.find(
      (p) => p.supplierId === mostFrequentSupplierId
    );
    return {
      link: `${getAppUrl()}${path.to.supplier(mostFrequentSupplierId)}`,
      id: mostFrequentSupplierId,
      unitPrice: supplier?.unitPrice,
      supplierUnitOfMeasureCode: supplier?.supplierUnitOfMeasureCode
    };
  }

  // Return null if no supplier was found
  return null;
}
