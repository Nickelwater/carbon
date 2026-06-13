import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { toolValidator } from "./items.models";

export type ToolLifePolicy = {
  readableId: string;
  itemTrackingType: Database["public"]["Enums"]["itemTrackingType"];
  lifeBasis: Database["public"]["Enums"]["toolLifeBasis"] | null;
  lifeLimit: number | null;
  lifeRemaining: number | null;
  isPermanent: boolean;
  dedicatedPartReadableId: string | null;
};

export async function getToolLifePolicy(
  client: SupabaseClient<Database>,
  itemId: string,
  companyId: string
) {
  const item = await client
    .from("item")
    .select("readableId, itemTrackingType")
    .eq("id", itemId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (item.error || !item.data?.readableId) {
    return { data: null, error: item.error ?? new Error("Item not found") };
  }

  const tool = await client
    .from("tool")
    .select(
      "lifeBasis, lifeLimit, lifeRemaining, isPermanent, dedicatedPartReadableId"
    )
    .eq("id", item.data.readableId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (tool.error) return { data: null, error: tool.error };

  return {
    data: {
      readableId: item.data.readableId,
      itemTrackingType: item.data.itemTrackingType,
      lifeBasis: tool.data?.lifeBasis ?? null,
      lifeLimit: tool.data?.lifeLimit ?? null,
      lifeRemaining: tool.data?.lifeRemaining ?? null,
      isPermanent: tool.data?.isPermanent ?? false,
      dedicatedPartReadableId: tool.data?.dedicatedPartReadableId ?? null
    } satisfies ToolLifePolicy,
    error: null
  };
}

export async function updateToolLifePolicy(
  client: SupabaseClient<Database>,
  itemId: string,
  companyId: string,
  userId: string,
  policy: Pick<
    z.infer<typeof toolValidator>,
    "lifeBasis" | "lifeLimit" | "isPermanent" | "dedicatedPartReadableId"
  >
) {
  const item = await client
    .from("item")
    .select("readableId")
    .eq("id", itemId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (item.error || !item.data?.readableId) {
    return { data: null, error: item.error ?? new Error("Item not found") };
  }

  const existing = await client
    .from("tool")
    .select("lifeBasis, lifeRemaining")
    .eq("id", item.data.readableId)
    .eq("companyId", companyId)
    .maybeSingle();

  const shouldInitRemaining =
    policy.lifeBasis &&
    policy.lifeLimit != null &&
    (!existing.data?.lifeBasis || existing.data.lifeRemaining == null);

  return client
    .from("tool")
    .update({
      lifeBasis: policy.lifeBasis ?? null,
      lifeLimit: policy.lifeLimit ?? null,
      isPermanent: policy.isPermanent ?? false,
      dedicatedPartReadableId: policy.dedicatedPartReadableId ?? null,
      ...(shouldInitRemaining ? { lifeRemaining: policy.lifeLimit } : {}),
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", item.data.readableId)
    .eq("companyId", companyId)
    .select("id")
    .single();
}

export async function getToolLifeLedger(
  client: SupabaseClient<Database>,
  toolReadableId: string,
  companyId: string,
  { limit = 50 }: { limit?: number } = {}
) {
  return client
    .from("toolLifeLedger")
    .select("*")
    .eq("toolId", toolReadableId)
    .eq("companyId", companyId)
    .order("createdAt", { ascending: false })
    .limit(limit);
}

export async function getToolSerialLife(
  client: SupabaseClient<Database>,
  itemId: string,
  companyId: string
) {
  return client
    .from("trackedEntity")
    .select("id, readableId, lifeRemaining, status")
    .eq("itemId", itemId)
    .eq("companyId", companyId)
    .order("readableId");
}

export async function adjustToolLife(
  client: SupabaseClient<Database>,
  args: {
    toolReadableId: string;
    companyId: string;
    trackedEntityId?: string | null;
    newRemaining: number;
    reason: string;
    userId: string;
  }
) {
  return client.rpc("adjust_tool_life", {
    p_tool_readable_id: args.toolReadableId,
    p_company_id: args.companyId,
    p_tracked_entity_id: args.trackedEntityId ?? null,
    p_new_remaining: args.newRemaining,
    p_reason: args.reason,
    p_user_id: args.userId
  });
}

export async function validatePermanentToolForMethod(
  client: SupabaseClient<Database>,
  toolItemId: string,
  makeMethodItemId: string,
  companyId: string
) {
  const [toolItem, methodItem] = await Promise.all([
    client
      .from("item")
      .select("readableId")
      .eq("id", toolItemId)
      .eq("companyId", companyId)
      .maybeSingle(),
    client
      .from("item")
      .select("readableId")
      .eq("id", makeMethodItemId)
      .eq("companyId", companyId)
      .maybeSingle()
  ]);

  if (toolItem.error || methodItem.error) {
    return { error: toolItem.error ?? methodItem.error };
  }

  const toolReadableId = toolItem.data?.readableId;
  if (!toolReadableId) {
    return { error: new Error("Tool item not found") };
  }

  const permanentTool = await client
    .from("tool")
    .select("isPermanent, dedicatedPartReadableId")
    .eq("id", toolReadableId)
    .eq("companyId", companyId)
    .maybeSingle();

  if (permanentTool.error) return { error: permanentTool.error };
  if (!permanentTool.data?.isPermanent) return { error: null };

  const partReadableId = methodItem.data?.readableId;
  if (partReadableId !== permanentTool.data.dedicatedPartReadableId) {
    return {
      error: new Error(
        "Permanent tools can only be used on operations for their dedicated part"
      )
    };
  }

  return { error: null };
}
