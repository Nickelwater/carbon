import { getCarbonServiceRole } from "@carbon/auth/client.server";
import type { Database } from "@carbon/database";
import { BINDERY_PRESS_API_KEY } from "@carbon/env";
import type { DocumentTypeId } from "@carbon/printing";
import {
  createPrintJob,
  getDocumentType,
  getDocumentTypesForSource,
  getPrinterContextForSource,
  updatePrintJobContent,
  updatePrintJobStatus
} from "@carbon/printing";
import {
  deliverPrintJob,
  getCachedPrinterConfig
} from "@carbon/printing/printing.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  GeneratedContent,
  PrintableDocumentItem
} from "../inngest/functions/tasks/print-job/renderers";
import {
  renderItemBuiltIn,
  renderItemWithTemplate
} from "../inngest/functions/tasks/print-job/renderers";
import {
  resolveKanbanData,
  resolveShippingLabelData,
  resolveStorageUnitData,
  resolveTrackedEntityData
} from "../inngest/functions/tasks/print-job/resolvers";

const DEFAULT_MEDIA_SIZE_ID = "label2x1";
const SHIPPING_LABEL_MEDIA_SIZE = "label4x6";

export type RunPrintJobPayload = {
  sourceDocument: string;
  sourceDocumentId: string;
  companyId: string;
  userId: string;
  locationId?: string;
  workCenterId?: string;
  printerRouteId?: string;
  documentTypeId?: DocumentTypeId;
  lineId?: string;
  packageIndex?: number;
  packageCount?: number;
};

export type RunPrintJobStep = {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
};

export type RunPrintJobResult = {
  printJobIds: string[];
  count: number;
};

export class PrintJobSkippedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintJobSkippedError";
  }
}

export async function runPrintJob(
  payload: RunPrintJobPayload,
  options?: { step?: RunPrintJobStep }
): Promise<RunPrintJobResult> {
  const client = getCarbonServiceRole();
  const {
    sourceDocument,
    sourceDocumentId,
    companyId,
    userId,
    locationId,
    workCenterId,
    printerRouteId: explicitPrinterRouteId,
    documentTypeId,
    lineId,
    packageIndex,
    packageCount
  } = payload;

  const isManual = Boolean(documentTypeId);

  if (!isManual) {
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    const { count: recentJobCount } = await client
      .from("printJob")
      .select("id", { count: "exact", head: true })
      .eq("sourceDocumentId", sourceDocumentId)
      .eq("companyId", companyId)
      .eq("origin", "auto")
      .gte("createdAt", thirtySecondsAgo);

    if (recentJobCount && recentJobCount > 0) {
      throw new PrintJobSkippedError(
        `Print jobs already exist for ${sourceDocument} ${sourceDocumentId}`
      );
    }
  }

  let printerConfig: Awaited<ReturnType<typeof getCachedPrinterConfig>> = null;

  if (explicitPrinterRouteId) {
    const { data: route } = await client
      .from("printerRoute")
      .select("id, name, format, mediaSizeId, printerUrl, apiKey, templateId")
      .eq("id", explicitPrinterRouteId)
      .eq("companyId", companyId)
      .single();
    if (route) {
      printerConfig = {
        printerRouteId: route.id,
        printerUrl: route.printerUrl,
        format: route.format as "zpl" | "pdf",
        mediaSizeId: route.mediaSizeId,
        templateId: route.templateId,
        autoPrint: true
      };
    }
  } else if (locationId) {
    printerConfig = await getCachedPrinterConfig(
      client,
      companyId,
      locationId,
      getPrinterContextForSource(sourceDocument, workCenterId),
      workCenterId
    );
  }

  if (isManual && !printerConfig?.printerUrl) {
    throw new Error(
      "No printer route configured. Select a printer or configure one in Settings → Printing."
    );
  }

  const documentTypeIds = documentTypeId
    ? [documentTypeId]
    : getDocumentTypesForSource(sourceDocument);
  const allPrintJobIds: string[] = [];

  for (const docTypeId of documentTypeIds) {
    const docType = getDocumentType(docTypeId);
    if (!docType) continue;

    const resolvedMediaSizeId =
      docTypeId === "shippingLabel"
        ? (printerConfig?.mediaSizeId ?? SHIPPING_LABEL_MEDIA_SIZE)
        : (printerConfig?.mediaSizeId ?? DEFAULT_MEDIA_SIZE_ID);

    const printJobIds = await processDocumentType(client, options?.step, {
      documentTypeId: docTypeId,
      hasBuiltInRenderer: docType.builtInRenderer !== null,
      sourceDocument,
      sourceDocumentId,
      companyId,
      userId,
      printerUrl: printerConfig?.printerUrl ?? "",
      format: printerConfig?.format ?? docType.defaultFormat,
      mediaSizeId: resolvedMediaSizeId,
      templateId: printerConfig?.templateId ?? null,
      lineId,
      packageIndex,
      packageCount,
      isManual
    });

    allPrintJobIds.push(...printJobIds);
  }

  if (isManual && allPrintJobIds.length === 0) {
    throw new Error(
      "Nothing to print — no labels could be generated for this document."
    );
  }

  return { printJobIds: allPrintJobIds, count: allPrintJobIds.length };
}

async function resolveDocumentItems(
  client: SupabaseClient<Database>,
  documentTypeId: DocumentTypeId,
  sourceDocument: string,
  sourceDocumentId: string,
  companyId: string,
  options: {
    lineId?: string;
    packageIndex?: number;
    packageCount?: number;
  } = {}
): Promise<{ docs: PrintableDocumentItem[]; readableId: string | null }> {
  switch (documentTypeId) {
    case "productLabel": {
      const resolved = await resolveTrackedEntityData(
        client,
        sourceDocument,
        sourceDocumentId,
        companyId
      );
      return {
        docs:
          resolved?.items.map((item) => ({
            type: "productLabel" as const,
            item
          })) ?? [],
        readableId: resolved?.readableId ?? null
      };
    }
    case "shippingLabel": {
      const resolved = await resolveShippingLabelData(
        client,
        sourceDocumentId,
        companyId,
        options
      );
      return {
        docs:
          resolved?.items.map((item) => ({
            type: "shippingLabel" as const,
            item
          })) ?? [],
        readableId: resolved?.readableId ?? null
      };
    }
    case "kanbanCard": {
      const resolved = await resolveKanbanData(client, sourceDocumentId);
      return {
        docs:
          resolved?.items.map((item) => ({
            type: "kanbanCard" as const,
            item
          })) ?? [],
        readableId: resolved?.readableId ?? null
      };
    }
    case "storageUnitLabel": {
      const resolved = await resolveStorageUnitData(client, sourceDocumentId);
      return {
        docs:
          resolved?.items.map((item) => ({
            type: "storageUnitLabel" as const,
            item
          })) ?? [],
        readableId: resolved?.readableId ?? null
      };
    }
  }
}

function describeDocument(
  doc: PrintableDocumentItem,
  readableId: string | null,
  sourceDocumentId: string
): string {
  const parts = [readableId ?? sourceDocumentId];

  switch (doc.type) {
    case "productLabel":
      if (doc.item.itemId) parts.push(doc.item.itemId);
      if (doc.item.number) parts.push(doc.item.number);
      break;
    case "shippingLabel":
      if (doc.item.partNumber) parts.push(doc.item.partNumber);
      if (doc.item.packingListNumber) parts.push(doc.item.packingListNumber);
      parts.push(`pkg ${doc.item.packageIndex}/${doc.item.packageCount}`);
      break;
    case "kanbanCard":
      if (doc.item.itemId) parts.push(doc.item.itemId);
      break;
    case "storageUnitLabel":
      break;
  }

  return parts.join(" — ");
}

function docStepKey(doc: PrintableDocumentItem, index: number): string {
  switch (doc.type) {
    case "shippingLabel":
      return `${doc.item.partNumber}-p${doc.item.packageIndex}`;
    case "productLabel":
      return doc.item.trackedEntityId;
    case "kanbanCard":
      return doc.item.id;
    case "storageUnitLabel":
      return doc.item.id;
    default:
      return String(index);
  }
}

async function generateAndDeliverOne(
  client: SupabaseClient<Database>,
  ctx: {
    documentTypeId: DocumentTypeId;
    hasBuiltInRenderer: boolean;
    sourceDocument: string;
    sourceDocumentId: string;
    companyId: string;
    userId: string;
    printerUrl: string;
    format: "zpl" | "pdf";
    mediaSizeId: string;
    templateId: string | null;
    isManual: boolean;
    readableId: string | null;
  },
  doc: PrintableDocumentItem,
  description: string
): Promise<string> {
  const {
    documentTypeId,
    hasBuiltInRenderer,
    sourceDocument,
    sourceDocumentId,
    companyId,
    userId,
    printerUrl,
    format,
    mediaSizeId,
    templateId,
    isManual,
    readableId
  } = ctx;

  const resumeCutoff = new Date(Date.now() - 120_000).toISOString();
  const { data: inFlight } = await client
    .from("printJob")
    .select("id")
    .eq("companyId", companyId)
    .eq("sourceDocumentId", sourceDocumentId)
    .eq("description", description)
    .eq("status", "generating")
    .is("content", null)
    .gte("createdAt", resumeCutoff)
    .order("createdAt", { ascending: false })
    .limit(1)
    .maybeSingle();

  let activeJobId = inFlight?.id;
  if (!activeJobId) {
    const job = await createPrintJob(client, {
      companyId,
      printerUrl,
      sourceDocument,
      sourceDocumentId,
      sourceDocumentReadableId: readableId ?? undefined,
      description,
      status: "generating",
      origin: isManual ? "manual" : "auto",
      createdBy: userId
    });

    if (job.error || !job.data) {
      throw new Error(
        job.error?.message ?? "Failed to create print job record"
      );
    }
    activeJobId = job.data.id;
  }

  try {
    let content: GeneratedContent;

    if (templateId && BINDERY_PRESS_API_KEY) {
      content = await renderItemWithTemplate(
        doc,
        templateId,
        BINDERY_PRESS_API_KEY,
        format
      );
    } else if (hasBuiltInRenderer) {
      content = await renderItemBuiltIn(
        client,
        companyId,
        doc,
        format,
        mediaSizeId
      );
    } else {
      await updatePrintJobStatus(client, activeJobId, companyId, "failed", {
        error: `Document type "${documentTypeId}" requires a BinderyPress template.`
      });
      throw new Error(
        `Document type "${documentTypeId}" requires a BinderyPress template.`
      );
    }

    const { error: contentError } = await updatePrintJobContent(
      client,
      activeJobId,
      companyId,
      content.content,
      content.contentType
    );
    if (contentError) {
      throw new Error(
        `Failed to save print job content: ${contentError.message}`
      );
    }
  } catch (renderError) {
    const message =
      renderError instanceof Error ? renderError.message : String(renderError);
    console.error(`Rendering failed for job ${activeJobId}: ${message}`);
    await updatePrintJobStatus(client, activeJobId, companyId, "failed", {
      error: `Rendering failed: ${message}`
    });
    throw renderError;
  }

  if (printerUrl) {
    const result = await deliverPrintJob(client, activeJobId, companyId);
    if (!result.success) {
      throw new Error(result.error);
    }
  } else {
    await updatePrintJobStatus(client, activeJobId, companyId, "completed");
  }

  return activeJobId;
}

async function processDocumentType(
  client: SupabaseClient<Database>,
  step: RunPrintJobStep | undefined,
  ctx: {
    documentTypeId: DocumentTypeId;
    hasBuiltInRenderer: boolean;
    sourceDocument: string;
    sourceDocumentId: string;
    companyId: string;
    userId: string;
    printerUrl: string;
    format: "zpl" | "pdf";
    mediaSizeId: string;
    templateId: string | null;
    lineId?: string;
    packageIndex?: number;
    packageCount?: number;
    isManual: boolean;
  }
): Promise<string[]> {
  const {
    documentTypeId,
    sourceDocument,
    sourceDocumentId,
    companyId,
    lineId,
    packageIndex,
    packageCount
  } = ctx;

  const { docs, readableId } = await resolveDocumentItems(
    client,
    documentTypeId,
    sourceDocument,
    sourceDocumentId,
    companyId,
    { lineId, packageIndex, packageCount }
  );
  if (docs.length === 0) return [];

  const printJobIds: string[] = [];
  const runStep = step?.run ?? ((_id, fn) => fn());

  for (let index = 0; index < docs.length; index++) {
    const doc = docs[index]!;
    const description = describeDocument(doc, readableId, sourceDocumentId);
    const stepKey = docStepKey(doc, index);

    const jobId = (await runStep(
      `print-${documentTypeId}-${sourceDocumentId}-${stepKey}`,
      () =>
        generateAndDeliverOne(client, { ...ctx, readableId }, doc, description)
    )) as string;

    printJobIds.push(jobId);
  }

  return printJobIds;
}
