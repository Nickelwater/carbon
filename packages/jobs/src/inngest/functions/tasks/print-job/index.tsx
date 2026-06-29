import { NonRetriableError } from "inngest";
import {
  PrintJobSkippedError,
  type RunPrintJobPayload,
  runPrintJob
} from "../../../../print/runPrintJob";
import { inngest } from "../../../client";

export const printJobFunction = inngest.createFunction(
  {
    id: "print-job",
    retries: 0,
    // Auto-print only — manual prints run synchronously from /x/print.
    idempotency:
      "event.data.companyId + '-' + event.data.sourceDocumentId + '-' + (event.data.documentTypeId ?? 'auto') + '-' + (event.data.lineId ?? '') + '-' + (event.data.packageIndex ?? '') + '-' + (event.data.printerRouteId ?? '')"
  },
  { event: "carbon/print-job" },
  async ({ event, step }) => {
    try {
      return await runPrintJob(event.data as RunPrintJobPayload, { step });
    } catch (err) {
      if (err instanceof PrintJobSkippedError) {
        throw new NonRetriableError(err.message);
      }
      throw err;
    }
  }
);
