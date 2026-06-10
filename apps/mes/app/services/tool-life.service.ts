import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AutoIssueResult = {
  errors: Array<{ jobOperationToolId: string; message: string }>;
  requiresSelection: Array<{
    jobOperationToolId: string;
    toolId: string;
    message?: string;
  }>;
};

export async function autoIssuePermanentTools(
  client: SupabaseClient<Database>,
  jobOperationId: string,
  userId: string
) {
  const result = await client.rpc("auto_issue_permanent_job_operation_tools", {
    p_job_operation_id: jobOperationId,
    p_user_id: userId
  });

  return {
    data: (result.data ?? {
      errors: [],
      requiresSelection: []
    }) as AutoIssueResult,
    error: result.error
  };
}

export async function issueJobOperationTool(
  client: SupabaseClient<Database>,
  jobOperationToolId: string,
  trackedEntityId: string | null,
  userId: string
) {
  return client.rpc("issue_job_operation_tool", {
    p_job_operation_tool_id: jobOperationToolId,
    p_tracked_entity_id: trackedEntityId,
    p_user_id: userId
  });
}

export async function accrueToolLifeForOperation(
  client: SupabaseClient<Database>,
  jobOperationId: string,
  quantityParts: number,
  eventType: "complete" | "scrap",
  userId: string
) {
  const result = await client.rpc("accrue_tool_life_for_operation", {
    p_job_operation_id: jobOperationId,
    p_quantity_parts: quantityParts,
    p_event_type: eventType,
    p_user_id: userId
  });

  if (result.error) {
    console.error("Failed to accrue tool life", {
      jobOperationId,
      quantityParts,
      eventType,
      error: result.error
    });
  }

  return result;
}

export type JobOperationToolWithLife = {
  id: string;
  quantity: number;
  issuedAt: string | null;
  autoIssued: boolean;
  trackedEntityId: string | null;
  toolId: string;
  toolReadableId: string | null;
  toolReadableIdWithRevision: string | null;
  toolName: string | null;
  itemTrackingType: Database["public"]["Enums"]["itemTrackingType"] | null;
  lifeBasis: Database["public"]["Enums"]["toolLifeBasis"] | null;
  lifeLimit: number | null;
  lifeRemaining: number | null;
  serialReadableId: string | null;
  serialLifeRemaining: number | null;
  thumbnailPath: string | null;
  modelPath: string | null;
  modelName: string | null;
  modelSize: number | null;
};

export async function getJobOperationToolsWithLife(
  client: SupabaseClient<Database>,
  jobOperationId: string
) {
  const tools = await client
    .from("jobOperationTool")
    .select("id, quantity, issuedAt, autoIssued, trackedEntityId, toolId")
    .eq("operationId", jobOperationId);

  if (tools.error || !tools.data?.length) {
    return { data: [] as JobOperationToolWithLife[], error: tools.error };
  }

  const toolItemIds = tools.data.map((row) => row.toolId);
  const trackedEntityIds = tools.data
    .map((row) => row.trackedEntityId)
    .filter((id): id is string => Boolean(id));

  const [items, trackedEntities] = await Promise.all([
    client
      .from("item")
      .select(
        "id, readableId, readableIdWithRevision, name, itemTrackingType, thumbnailPath, modelUpload:modelUploadId(modelPath, name, size, thumbnailPath)"
      )
      .in("id", toolItemIds),
    trackedEntityIds.length
      ? client
          .from("trackedEntity")
          .select("id, readableId, lifeRemaining")
          .in("id", trackedEntityIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (items.error) {
    console.error("Failed to fetch tool items", {
      jobOperationId,
      toolItemIds,
      error: items.error
    });
  }

  const itemById = new Map((items.data ?? []).map((item) => [item.id, item]));
  const readableIds = (items.data ?? []).map((item) => item.readableId);
  const toolPolicies =
    readableIds.length > 0
      ? await client
          .from("tool")
          .select("id, lifeBasis, lifeLimit, lifeRemaining")
          .in("id", readableIds)
      : { data: [], error: null };
  const policyByReadableId = new Map(
    (toolPolicies.data ?? []).map((tool) => [tool.id, tool])
  );
  const trackedById = new Map(
    (trackedEntities.data ?? []).map((entity) => [entity.id, entity])
  );

  const data = tools.data.map((row) => {
    const item = itemById.get(row.toolId);
    const policy = item ? policyByReadableId.get(item.readableId) : undefined;
    const tracked = row.trackedEntityId
      ? trackedById.get(row.trackedEntityId)
      : undefined;

    const modelUpload = item?.modelUpload as {
      modelPath: string;
      name: string | null;
      size: number | null;
      thumbnailPath: string | null;
    } | null;

    return {
      id: row.id,
      quantity: row.quantity,
      issuedAt: row.issuedAt,
      autoIssued: row.autoIssued,
      trackedEntityId: row.trackedEntityId,
      toolId: row.toolId,
      toolReadableId: item?.readableId ?? null,
      toolReadableIdWithRevision: item?.readableIdWithRevision ?? null,
      toolName: item?.name ?? null,
      itemTrackingType: item?.itemTrackingType ?? null,
      lifeBasis: policy?.lifeBasis ?? null,
      lifeLimit: policy?.lifeLimit ?? null,
      lifeRemaining: policy?.lifeRemaining ?? null,
      serialReadableId: tracked?.readableId ?? null,
      serialLifeRemaining: tracked?.lifeRemaining ?? null,
      thumbnailPath: item?.thumbnailPath ?? modelUpload?.thumbnailPath ?? null,
      modelPath: modelUpload?.modelPath ?? null,
      modelName: modelUpload?.name ?? null,
      modelSize: modelUpload?.size ?? null
    } satisfies JobOperationToolWithLife;
  });

  return { data, error: null };
}
