import { logger, task } from "@trigger.dev/sdk";
import { z } from "zod";

const workflowPayloadSchema = z.object({
  workflowId: z.string(),
  data: z.any(),
});

export type WorkflowPayload = z.infer<typeof workflowPayloadSchema>;

// 2. Workflow Trigger Worker
export const workflowDispatchTask = task({
  id: "event-handler-workflow",
  run: async (payload: WorkflowPayload) => {
    logger.info(`Triggering workflow ${payload.workflowId}`);

    // Here you would trigger another business logic task
    // e.g., await tasks.trigger(payload.workflowId, payload.data);
  },
});
