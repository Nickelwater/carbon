import { logger, task } from "@trigger.dev/sdk/v3";
import axios from "axios";
import { z } from "zod";

const webhookPayloadSchema = z.object({
  url: z.string().url(),
  data: z.any(),
  config: z
    .object({
      headers: z.record(z.string()).optional(),
    })
    .passthrough(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// 1. Generic Webhook Worker
export const webhookTask = task({
  id: "event-handler-webhook",
  retry: {
    maxAttempts: 3, // Auto-retry on 500s or timeouts
    factor: 2,
    randomize: true,
  },
  run: async (payload: WebhookPayload) => {
    logger.info(`Firing webhook to ${payload.url}`);
    
    await axios.post(payload.url, payload.data, {
      headers: payload.config.headers,
    });
  },
});