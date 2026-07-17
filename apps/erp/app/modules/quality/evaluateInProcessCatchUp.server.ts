import { trigger } from "@carbon/jobs";

/**
 * Fire-and-forget catch-up: dispatches the same evaluator the event system's
 * WORKFLOW handler runs reactively off productionQuantity/productionEvent
 * writes (see packages/jobs/src/inngest/functions/tasks/evaluate-in-process-inspections.ts),
 * so callers that need up-to-date In-Process runs ahead of a gate (Lot
 * Accept, operation Finish) don't have to wait for the ~1 min event-queue
 * cadence.
 *
 * This is still asynchronous (Inngest), just lower-latency than the queue
 * path — the Lot dependency gate (see quality.server.ts
 * dispositionInboundInspection) only blocks on dependency rows that already
 * exist, so a run created a moment before Accept may not have landed yet.
 * See .ai/rules/event-system.md for the underlying latency characteristics.
 */
export async function catchUpInProcessInspections(args: {
  companyId: string;
  jobOperationId: string;
  userId?: string;
  reason?: string;
}) {
  try {
    await trigger("evaluate-in-process-inspections", {
      companyId: args.companyId,
      jobOperationId: args.jobOperationId,
      userId: args.userId,
      reason: args.reason ?? "catch-up"
    });
  } catch (err) {
    console.error("Failed to trigger in-process inspection catch-up:", err);
  }
}

/**
 * Same catch-up, fanned out across every operation on a job — used before Lot
 * creation (job completion), where any of the job's operations may have due
 * In-Process runs that should exist before dependency rows are computed.
 */
export async function catchUpInProcessInspectionsForJob(args: {
  companyId: string;
  jobOperationIds: string[];
  userId?: string;
  reason?: string;
}) {
  await Promise.all(
    args.jobOperationIds.map((jobOperationId) =>
      catchUpInProcessInspections({
        companyId: args.companyId,
        jobOperationId,
        userId: args.userId,
        reason: args.reason
      })
    )
  );
}
