import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { inngest } from "../../client";
import {
  computeInProcessTriggerOrdinals,
  type InProcessTriggerType,
  toExistingOrdinals,
  triggerThresholdForOrdinal,
  unionIntervalSeconds
} from "./inProcessTrigger";

// Re-exported for callers that only need the pure DB-status mapping (kept in
// inProcessTrigger.ts — the env-free pure lib — so it can be unit tested
// without pulling in @carbon/auth's env validation).
export {
  mapInspectionStatusToOrdinalStatus,
  toExistingOrdinals
} from "./inProcessTrigger";

type ServiceRole = ReturnType<typeof getCarbonServiceRole>;

const UNIQUE_VIOLATION = "23505";

export const evaluateInProcessInspectionsFunction = inngest.createFunction(
  {
    id: "evaluate-in-process-inspections",
    retries: 3,
    concurrency: {
      // Serialize per operation so concurrent productionQuantity/productionEvent
      // writes don't race to create/cancel the same ordinal.
      limit: 1,
      key: "event.data.jobOperationId"
    }
  },
  { event: "carbon/evaluate-in-process-inspections" },
  async ({ event, step, logger }) => {
    const { companyId, jobOperationId, userId, reason } = event.data;

    const result = await step.run(
      "evaluate-in-process-inspections",
      async () => {
        const serviceRole = getCarbonServiceRole();
        logger.info("Evaluating in-process inspections", {
          companyId,
          jobOperationId,
          reason
        });
        return evaluateInProcessInspectionsForOperation(serviceRole, {
          companyId,
          jobOperationId,
          userId,
          reason
        });
      }
    );

    return result;
  }
);

export async function evaluateInProcessInspectionsForOperation(
  client: ServiceRole,
  args: {
    companyId: string;
    jobOperationId: string;
    userId?: string;
    reason?: string;
  }
) {
  const { companyId, jobOperationId } = args;
  const actorId = args.userId ?? "system";
  const anyClient = client as any;

  const plansResult = await anyClient
    .from("jobOperationInspectionPlan")
    .select("*")
    .eq("jobOperationId", jobOperationId)
    .eq("companyId", companyId)
    .eq("active", true);

  const plans: any[] = plansResult.data ?? [];
  if (plans.length === 0) {
    return { evaluated: 0, created: 0, cancelled: 0 };
  }

  const jobOperation = await client
    .from("jobOperation")
    .select("id, jobId, companyId")
    .eq("id", jobOperationId)
    .single();

  if (jobOperation.error || !jobOperation.data) {
    throw new Error(`jobOperation ${jobOperationId} not found`);
  }

  const job = await client
    .from("job")
    .select("id, itemId")
    .eq("id", jobOperation.data.jobId)
    .single();

  if (job.error || !job.data) {
    throw new Error(`job for operation ${jobOperationId} not found`);
  }

  let created = 0;
  let cancelled = 0;

  for (const plan of plans) {
    const outcome = await evaluatePlan(client, {
      companyId,
      jobOperationId,
      jobId: jobOperation.data.jobId,
      itemId: job.data.itemId,
      plan,
      actorId
    });
    created += outcome.created;
    cancelled += outcome.cancelled;
  }

  return { evaluated: plans.length, created, cancelled };
}

async function computeCurrentMetric(
  client: ServiceRole,
  args: {
    companyId: string;
    jobOperationId: string;
    triggerType: InProcessTriggerType;
  }
): Promise<{
  cumulativeProductionQuantity?: number;
  accumulatedActiveSeconds?: number;
}> {
  const { companyId, jobOperationId, triggerType } = args;

  if (triggerType === "Quantity") {
    const quantities = await client
      .from("productionQuantity")
      .select("quantity")
      .eq("jobOperationId", jobOperationId)
      .eq("companyId", companyId)
      .eq("type", "Production");

    const cumulativeProductionQuantity = (quantities.data ?? []).reduce(
      (sum, row) => sum + (row.quantity ?? 0),
      0
    );
    return { cumulativeProductionQuantity };
  }

  const events = await client
    .from("productionEvent")
    .select("startTime, endTime")
    .eq("jobOperationId", jobOperationId)
    .eq("companyId", companyId);

  const nowMs = Date.now();
  const intervals = (events.data ?? [])
    .filter((event) => !!event.startTime)
    .map((event) => ({
      start: new Date(event.startTime).getTime() / 1000,
      end: (event.endTime ? new Date(event.endTime).getTime() : nowMs) / 1000
    }));

  return { accumulatedActiveSeconds: unionIntervalSeconds(intervals) };
}

async function evaluatePlan(
  client: ServiceRole,
  args: {
    companyId: string;
    jobOperationId: string;
    jobId: string;
    itemId: string;
    plan: any;
    actorId: string;
  }
) {
  const { companyId, jobOperationId, jobId, itemId, plan, actorId } = args;
  const anyClient = client as any;
  const triggerType: InProcessTriggerType = plan.triggerType;

  const { cumulativeProductionQuantity, accumulatedActiveSeconds } =
    await computeCurrentMetric(client, {
      companyId,
      jobOperationId,
      triggerType
    });

  const existingRows = await anyClient
    .from("inspectionInProcess")
    .select("id, triggerOrdinal, inspectionId, inspection(status)")
    .eq("jobOperationInspectionPlanId", plan.id)
    .eq("companyId", companyId);

  const existingOrdinals = toExistingOrdinals(
    (existingRows.data ?? []).map((row: any) => ({
      triggerOrdinal: row.triggerOrdinal,
      status: row.inspection?.status ?? "Pending"
    }))
  );

  const firstTriggerAt = Number(plan.firstTriggerAt);
  const interval = Number(plan.interval);

  const { toCreate, toCancel } = computeInProcessTriggerOrdinals({
    triggerType,
    cumulativeProductionQuantity,
    accumulatedActiveSeconds,
    firstTriggerAt,
    interval,
    existingOrdinals
  });

  for (const ordinal of toCreate) {
    await createInProcessRun(client, {
      companyId,
      jobOperationId,
      jobId,
      itemId,
      plan,
      ordinal,
      threshold: triggerThresholdForOrdinal(ordinal, firstTriggerAt, interval),
      triggerType,
      actorId
    });
  }

  if (toCancel.length > 0) {
    await cancelInProcessRuns(client, {
      companyId,
      planId: plan.id,
      ordinals: toCancel,
      actorId
    });
  }

  return { created: toCreate.length, cancelled: toCancel.length };
}

async function createInProcessRun(
  client: ServiceRole,
  args: {
    companyId: string;
    jobOperationId: string;
    jobId: string;
    itemId: string;
    plan: any;
    ordinal: number;
    threshold: number;
    triggerType: InProcessTriggerType;
    actorId: string;
  }
) {
  const {
    companyId,
    jobOperationId,
    jobId,
    itemId,
    plan,
    ordinal,
    threshold,
    triggerType,
    actorId
  } = args;
  const anyClient = client as any;

  const sequence = await client.rpc("get_next_sequence", {
    sequence_name: "inProcessInspection",
    company_id: companyId
  } as any);

  if (sequence.error || !sequence.data) {
    throw new Error(
      `Failed to allocate in-process inspection readable id: ${sequence.error?.message}`
    );
  }
  const readableId = sequence.data as string;

  const header = await anyClient
    .from("inspection")
    .insert({
      inspectionId: readableId,
      type: "InProcess",
      itemId,
      lotSize: plan.samplesPerRun ?? 1,
      samplingStandard: "ANSI_Z1_4",
      samplingPlanType: "All",
      sampleSize: plan.samplesPerRun ?? 1,
      acceptanceNumber: 0,
      rejectionNumber: 1,
      inspectionDocumentId: plan.inspectionDocumentId ?? null,
      status: "Pending",
      companyId,
      createdBy: actorId
    })
    .select("id")
    .single();

  if (header.error || !header.data) {
    throw new Error(
      `Failed to create in-process inspection header: ${header.error?.message}`
    );
  }

  const inserted = await anyClient.from("inspectionInProcess").insert({
    inspectionId: header.data.id,
    jobId,
    jobOperationId,
    companyId,
    createdBy: actorId,
    jobOperationInspectionPlanId: plan.id,
    triggerType,
    triggerOrdinal: ordinal,
    triggerThreshold: threshold,
    samplesPerRun: plan.samplesPerRun ?? 1,
    requiredForLotAcceptance: plan.requiredForLotAcceptance ?? false,
    reaction: plan.reaction ?? "Notify",
    dueAt: new Date().toISOString()
  });

  if (inserted.error) {
    // Idempotent: a concurrent evaluation may have already created this
    // ordinal (unique index on plan/triggerType/ordinal/company). Clean up
    // the now-orphaned header we just inserted and move on.
    await anyClient.from("inspection").delete().eq("id", header.data.id);
    if (inserted.error.code !== UNIQUE_VIOLATION) {
      throw new Error(
        `Failed to create in-process inspection run: ${inserted.error.message}`
      );
    }
  }
}

async function cancelInProcessRuns(
  client: ServiceRole,
  args: {
    companyId: string;
    planId: string;
    ordinals: number[];
    actorId: string;
  }
) {
  const { companyId, planId, ordinals, actorId } = args;
  const anyClient = client as any;

  const rows = await anyClient
    .from("inspectionInProcess")
    .select("id, inspectionId, triggerOrdinal")
    .eq("jobOperationInspectionPlanId", planId)
    .eq("companyId", companyId)
    .in("triggerOrdinal", ordinals);

  const inspectionIds = (rows.data ?? []).map((row: any) => row.inspectionId);
  if (inspectionIds.length === 0) return;

  await anyClient
    .from("inspection")
    .update({
      status: "Cancelled",
      dispositionedBy: actorId,
      dispositionedAt: new Date().toISOString()
    })
    .in("id", inspectionIds)
    .eq("companyId", companyId);

  await anyClient
    .from("inspectionInProcess")
    .update({ completedAt: new Date().toISOString() })
    .in(
      "id",
      (rows.data ?? []).map((row: any) => row.id)
    );
}
