import { getCarbonServiceRole } from "@carbon/auth/client.server";
import { deliverPrintJob } from "@carbon/printing/printing.server";
import { NonRetriableError } from "inngest";
import { inngest } from "../../client";

export const printJobDeliverFunction = inngest.createFunction(
  {
    id: "print-job-deliver",
    retries: 0,
    idempotency: "event.data.printJobId"
  },
  { event: "carbon/print-job-deliver" },
  async ({ event }) => {
    const client = getCarbonServiceRole();
    const { printJobId, companyId } = event.data;

    const result = await deliverPrintJob(client, printJobId, companyId);

    if (!result.success) {
      throw new NonRetriableError(result.error);
    }

    return result;
  }
);
