import { assertIsPost } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { runPrintJob, trigger } from "@carbon/jobs";
import { manualPrintValidator } from "@carbon/printing";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {});

  const json = await request.json();
  const validation = manualPrintValidator.safeParse(json);

  if (!validation.success) {
    return { success: false, message: "Invalid print request" };
  }

  const payload = {
    ...validation.data,
    companyId,
    userId
  };

  try {
    if (payload.documentTypeId) {
      const result = await runPrintJob(payload);
      const labelWord = result.count === 1 ? "label" : "labels";
      return {
        success: true,
        message: `Sent ${result.count} ${labelWord} to printer`
      };
    }

    await trigger("print-job", payload);
    return { success: true, message: "Print job queued" };
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : "Failed to print"
    };
  }
}
