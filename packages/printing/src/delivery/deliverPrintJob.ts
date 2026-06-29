import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updatePrintJobStatus } from "../service";
import {
  isConnectionRefusedError,
  isLikelyPrinterDeliveryCompleteError
} from "./deliveryErrors";
import { sendToProxyBox } from "./proxybox";

export type DeliverPrintJobResult =
  | { success: true; skipped?: boolean; assumedDelivered?: boolean }
  | { success: false; error: string };

/**
 * Send a queued print job to its configured printer. Shared by the Inngest
 * deliver task and the print-job generate loop so delivery is not dependent on
 * a separate sendEvent step (which could be skipped on function replay).
 */
export async function deliverPrintJob(
  client: SupabaseClient<Database>,
  printJobId: string,
  companyId: string
): Promise<DeliverPrintJobResult> {
  const { data: job, error: jobError } = await client
    .from("printJob")
    .select("id, content, contentType, printerUrl, status, attempts")
    .eq("id", printJobId)
    .eq("companyId", companyId)
    .single();

  if (jobError || !job) {
    return { success: false, error: `Print job not found: ${printJobId}` };
  }

  if (!job.content || !job.contentType) {
    await updatePrintJobStatus(client, printJobId, companyId, "failed", {
      error: "Print job has no content"
    });
    return { success: false, error: "Print job has no content" };
  }

  if (job.status === "completed") {
    return { success: true, skipped: true };
  }

  if (job.status === "printing") {
    return {
      success: false,
      error: "Print job delivery already in progress — refusing duplicate send"
    };
  }

  if (job.status === "failed") {
    return {
      success: false,
      error: `Refusing delivery for failed print job "${printJobId}"`
    };
  }

  if (!job.printerUrl) {
    await updatePrintJobStatus(client, printJobId, companyId, "completed");
    return { success: true, skipped: true };
  }

  const { data: route } = await client
    .from("printerRoute")
    .select("apiKey")
    .eq("printerUrl", job.printerUrl)
    .eq("companyId", companyId)
    .limit(1)
    .maybeSingle();

  const apiKey = route?.apiKey;

  const { data: claimed, error: claimError } = await client
    .from("printJob")
    .update({
      status: "printing",
      attempts: (job.attempts ?? 0) + 1,
      updatedAt: new Date().toISOString()
    })
    .eq("id", printJobId)
    .eq("companyId", companyId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    return {
      success: false,
      error: "Print job is no longer queued — refusing duplicate delivery"
    };
  }

  try {
    const content =
      job.contentType === "pdf"
        ? Buffer.from(job.content, "base64")
        : job.content;

    await sendToProxyBox({
      url: job.printerUrl,
      apiKey,
      content
    });

    await updatePrintJobStatus(client, printJobId, companyId, "completed");

    return { success: true };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown delivery error";

    if (isConnectionRefusedError(err)) {
      await updatePrintJobStatus(client, printJobId, companyId, "failed", {
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }

    if (isLikelyPrinterDeliveryCompleteError(err)) {
      await updatePrintJobStatus(client, printJobId, companyId, "completed");
      return { success: true, assumedDelivered: true };
    }

    await updatePrintJobStatus(client, printJobId, companyId, "failed", {
      error: errorMessage
    });

    return { success: false, error: errorMessage };
  }
}
