import { z } from "zod";
import { inngest } from "../../client";

const workflowPayloadSchema = z.object({
  workflowId: z.string(),
  data: z.any()
});

export type WorkflowPayload = z.infer<typeof workflowPayloadSchema>;

/**
 * WORKFLOW-handler dispatch registry. `eventSystemSubscription.config.workflowId`
 * selects which entry runs; each entry extracts an Inngest event name + data
 * from the raw `dispatch_event_batch()` row event
 * (`{ table, operation, recordId, new, old, timestamp }`).
 */
const workflows: Record<
  string,
  (data: any) => { name: string; data: Record<string, unknown> } | null
> = {
  "evaluate-in-process-inspections": (data) => {
    // productionQuantity / productionEvent INSERT/UPDATE — both carry
    // jobOperationId + companyId on the row itself.
    const record = data.operation === "DELETE" ? data.old : data.new;
    if (!record?.jobOperationId || !record?.companyId) return null;
    return {
      name: "carbon/evaluate-in-process-inspections",
      data: {
        companyId: record.companyId,
        jobOperationId: record.jobOperationId,
        reason: `${data.table}:${data.operation}`
      }
    };
  }
};

export const workflowFunction = inngest.createFunction(
  {
    id: "event-handler-workflow",
    retries: 3,
    idempotency: "event.data.msgId",
    concurrency: {
      limit: 0,
      key: "event.data.data.table + '-' + event.data.data.recordId"
    }
  },
  { event: "carbon/event-workflow" },
  async ({ event, step, logger }) => {
    const payload = workflowPayloadSchema.parse(event.data);

    await step.run("trigger-workflow", async () => {
      const resolve = workflows[payload.workflowId];
      if (!resolve) {
        logger.warn(`No workflow handler registered for ${payload.workflowId}`);
        return;
      }

      const dispatch = resolve(payload.data);
      if (!dispatch) {
        logger.info(`Workflow ${payload.workflowId} had nothing to dispatch`, {
          table: payload.data?.table,
          recordId: payload.data?.recordId
        });
        return;
      }

      logger.info(`Triggering workflow ${payload.workflowId}`, dispatch.data);
      await inngest.send(dispatch as any);
    });
  }
);
