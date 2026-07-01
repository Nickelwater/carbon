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

type PrintJobDeliveryRow = {
  id: string;
  content: string | null;
  contentType: string | null;
  printerUrl: string | null;
  status: string;
  attempts: number | null;
};

async function resolvePrinterApiKey(
  client: SupabaseClient<Database>,
  companyId: string,
  printerUrl: string
): Promise<string | null | undefined> {
  const { data: route } = await client
    .from("printerRoute")
    .select("apiKey")
    .eq("printerUrl", printerUrl)
    .eq("companyId", companyId)
    .limit(1)
    .maybeSingle();

  return route?.apiKey;
}

async function sendPrintContent(
  printerUrl: string,
  apiKey: string | null | undefined,
  contentType: string,
  content: string
): Promise<void> {
  const payload =
    contentType === "pdf" ? Buffer.from(content, "base64") : content;

  await sendToProxyBox({
    url: printerUrl,
    apiKey,
    content: payload
  });
}

async function finalizeDeliveryResult(
  client: SupabaseClient<Database>,
  printJobIds: string[],
  companyId: string,
  err: unknown
): Promise<DeliverPrintJobResult> {
  const errorMessage =
    err instanceof Error ? err.message : "Unknown delivery error";

  if (isConnectionRefusedError(err)) {
    for (const printJobId of printJobIds) {
      await updatePrintJobStatus(client, printJobId, companyId, "failed", {
        error: errorMessage
      });
    }
    return { success: false, error: errorMessage };
  }

  if (isLikelyPrinterDeliveryCompleteError(err)) {
    for (const printJobId of printJobIds) {
      await updatePrintJobStatus(client, printJobId, companyId, "completed");
    }
    return { success: true, assumedDelivered: true };
  }

  for (const printJobId of printJobIds) {
    await updatePrintJobStatus(client, printJobId, companyId, "failed", {
      error: errorMessage
    });
  }

  return { success: false, error: errorMessage };
}

/**
 * Send multiple queued ZPL print jobs as one printer payload while {printJob} rows
 * are kept per label; only the HTTP delivery is batched.
 */
export async function deliverCombinedPrintJobs(
  client: SupabaseClient<Database>,
  printJobIds: string[],
  companyId: string
): Promise<DeliverPrintJobResult> {
  if (printJobIds.length === 0) {
    return { success: false, error: "No print jobs to deliver" };
  }

  if (printJobIds.length === 1) {
    return deliverPrintJob(client, printJobIds[0]!, companyId);
  }

  const { data: jobs, error: jobsError } = await client
    .from("printJob")
    .select("id, content, contentType, printerUrl, status, attempts")
    .in("id", printJobIds)
    .eq("companyId", companyId);

  if (jobsError || !jobs) {
    return {
      success: false,
      error: `Failed to load print jobs: ${jobsError?.message ?? "unknown error"}`
    };
  }

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const orderedJobs: PrintJobDeliveryRow[] = [];

  for (const printJobId of printJobIds) {
    const job = jobsById.get(printJobId);
    if (!job) {
      return { success: false, error: `Print job not found: ${printJobId}` };
    }
    orderedJobs.push(job);
  }

  const pendingJobs = orderedJobs.filter((job) => job.status !== "completed");
  if (pendingJobs.length === 0) {
    return { success: true, skipped: true };
  }

  const invalidJob = pendingJobs.find(
    (job) =>
      !job.content ||
      !job.contentType ||
      job.contentType !== "zpl" ||
      job.status === "printing" ||
      job.status === "failed" ||
      job.status === "generating"
  );
  if (invalidJob) {
    if (invalidJob.status === "printing") {
      return {
        success: false,
        error:
          "Print job delivery already in progress — refusing duplicate send"
      };
    }
    if (invalidJob.status === "failed") {
      return {
        success: false,
        error: `Refusing delivery for failed print job "${invalidJob.id}"`
      };
    }
    return {
      success: false,
      error: invalidJob.content
        ? `Batch delivery requires ZPL content (job "${invalidJob.id}" is ${invalidJob.contentType ?? "unknown"})`
        : `Print job has no content: ${invalidJob.id}`
    };
  }

  const printerUrl = pendingJobs[0]!.printerUrl;
  if (!printerUrl) {
    for (const job of pendingJobs) {
      await updatePrintJobStatus(client, job.id, companyId, "completed");
    }
    return { success: true, skipped: true };
  }

  if (pendingJobs.some((job) => job.printerUrl !== printerUrl)) {
    return {
      success: false,
      error:
        "Batch delivery requires all print jobs to use the same printer URL"
    };
  }

  const apiKey = await resolvePrinterApiKey(client, companyId, printerUrl);
  const claimedJobIds: string[] = [];

  for (const job of pendingJobs) {
    const { data: claimed, error: claimError } = await client
      .from("printJob")
      .update({
        status: "printing",
        attempts: (job.attempts ?? 0) + 1,
        updatedAt: new Date().toISOString()
      })
      .eq("id", job.id)
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

    claimedJobIds.push(job.id);
  }

  const combinedContent = pendingJobs.map((job) => job.content!).join("\n");

  try {
    await sendPrintContent(printerUrl, apiKey, "zpl", combinedContent);

    for (const printJobId of claimedJobIds) {
      await updatePrintJobStatus(client, printJobId, companyId, "completed");
    }

    return { success: true };
  } catch (err) {
    return finalizeDeliveryResult(client, claimedJobIds, companyId, err);
  }
}

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

  const apiKey = await resolvePrinterApiKey(client, companyId, job.printerUrl);

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
    await sendPrintContent(
      job.printerUrl,
      apiKey,
      job.contentType,
      job.content
    );

    await updatePrintJobStatus(client, printJobId, companyId, "completed");

    return { success: true };
  } catch (err) {
    return finalizeDeliveryResult(client, [printJobId], companyId, err);
  }
}
