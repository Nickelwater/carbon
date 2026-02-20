import { assertIsPost, error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { salesRfqLineValidator, upsertSalesRFQLine } from "~/modules/sales";
import { setCustomFields } from "~/utils/form";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, companyId, userId } = await requirePermissions(request, {
    create: "sales"
  });

  const { rfqId } = params;
  if (!rfqId) {
    throw new Error("rfqId not found");
  }

  const formData = await request.formData();
  const validation = await validator(salesRfqLineValidator).validate(formData);

  if (validation.error) {
    return validationError(validation.error);
  }

  // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  const { id, ...d } = validation.data;

  const insertLine = await upsertSalesRFQLine(client, {
    ...d,
    companyId,
    createdBy: userId,
    customFields: setCustomFields(formData)
  });
  if (insertLine.error) {
    throw redirect(
      path.to.salesRfq(rfqId),
      await flash(request, error(insertLine.error, "Failed to insert RFQ line"))
    );
  }

  const lineId = insertLine.data?.id;
  if (!lineId) {
    throw redirect(
      path.to.salesRfq(rfqId),
      await flash(request, error(insertLine, "Failed to insert RFQ line"))
    );
  }

  throw redirect(path.to.salesRfqLine(rfqId, lineId));
}
