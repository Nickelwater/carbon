import { EventSchema } from "@carbon/database/event";
import { z } from "zod";
import { getJobDatabaseClient } from "../../../db";
import { computeEventIds } from "../../../workflows/event-ids";
import { matchAndQueue } from "../../../workflows/matcher";
import { inngest } from "../../client";

const workflowPayloadSchema = z.object({
  // pgmq msg_id is BIGINT, which node-pg hands back as a string.
  msgId: z.coerce.number(),
  companyId: z.string(),
  // No `actorId`: origin is decided by the run tag alone, so who the actor was
  // changes nothing here. The audit handler is what reads it off the queue.
  workflowRunId: z.string().nullish(),
  data: EventSchema
});

export type WorkflowPayload = z.infer<typeof workflowPayloadSchema>;

/** Record-change entry point of the workflow matcher: one pgmq announcement ->
 * catalog event ids -> one workflowRun per subscribed workflow.
 *
 * Fork in-process inspection still fires off productionQuantity / productionEvent
 * writes (seeded WORKFLOW subscriptions in 20260717194512) because the matcher
 * catalog does not replace that evaluator. */
function inspectionEventFromRecord(data: z.infer<typeof EventSchema>) {
  if (data.table !== "productionQuantity" && data.table !== "productionEvent") {
    return null;
  }
  const record = data.operation === "DELETE" ? data.old : data.new;
  if (!record?.jobOperationId || !record?.companyId) return null;
  return {
    name: "carbon/evaluate-in-process-inspections" as const,
    data: {
      companyId: record.companyId as string,
      jobOperationId: record.jobOperationId as string,
      reason: `${data.table}:${data.operation}`
    }
  };
}

export const workflowFunction = inngest.createFunction(
  {
    id: "event-handler-workflow",
    retries: 3,
    idempotency: "event.data.msgId"
  },
  { event: "carbon/event-workflow" },
  async ({ event, step }) => {
    const payload = workflowPayloadSchema.parse(event.data);
    if (payload.data.operation === "TRUNCATE") {
      return { queued: 0, blocked: 0 };
    }

    const inspectionEvent = inspectionEventFromRecord(payload.data);
    if (inspectionEvent) {
      await step.sendEvent("evaluate-in-process-inspections", inspectionEvent);
    }

    const eventIds = computeEventIds({
      table: payload.data.table,
      operation: payload.data.operation,
      old: payload.data.old,
      new: payload.data.new
    });
    if (eventIds.length === 0) {
      return { queued: 0, blocked: 0 };
    }

    const { operation } = payload.data;
    const result = await step.run("match", async () => {
      const db = getJobDatabaseClient();
      return matchAndQueue(db, {
        companyId: payload.companyId,
        workflowRunId: payload.workflowRunId ?? null,
        sourceEventId: `pgmq:${payload.msgId}`,
        eventIds,
        trigger: {
          kind: "record",
          table: payload.data.table,
          recordId: payload.data.recordId,
          operation,
          record: payload.data.new ?? payload.data.old,
          before: operation === "UPDATE" ? payload.data.old : null,
          after: operation === "UPDATE" ? payload.data.new : null
        },
        triggerTable: payload.data.table,
        triggerRecordId: payload.data.recordId
      });
    });

    if (result.events.length > 0) {
      await step.sendEvent("queue-runs", result.events);
    }
    return { queued: result.queued, blocked: result.blocked };
  }
);
