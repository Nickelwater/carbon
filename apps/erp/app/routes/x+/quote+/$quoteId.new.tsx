import { assertIsPost, error, getCarbonServiceRole } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import { validationError, validator } from "@carbon/form";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  newQuotePartLineValidator,
  quoteLineValidator,
  upsertQuoteLine,
  upsertQuoteLineMethod,
  upsertQuotePart
} from "~/modules/sales";
import { setCustomFields } from "~/utils/form";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {
    create: "sales"
  });

  const { quoteId } = params;
  if (!quoteId) throw new Error("Could not find quoteId");

  const formData = await request.formData();
  const partSource = formData.get("partSource");

  if (partSource === "quotePart") {
    const validation = await validator(newQuotePartLineValidator).validate(
      formData
    );
    if (validation.error) {
      return validationError(validation.error);
    }
    const d = validation.data;
    const serviceRole = getCarbonServiceRole();

    const createQuotePart = await upsertQuotePart(serviceRole, {
      quoteId,
      name: d.quotePartName,
      description: d.quotePartDescription ?? undefined,
      defaultMethodType: d.defaultMethodType,
      unitOfMeasureCode: d.unitOfMeasureCode ?? undefined,
      modelUploadId: d.modelUploadId ?? undefined,
      companyId,
      createdBy: userId
    });
    if (createQuotePart.error || !createQuotePart.data?.id) {
      throw redirect(
        path.to.quote(quoteId),
        await flash(
          request,
          error(
            createQuotePart.error ?? new Error("Quote part not created"),
            "Failed to create quote part."
          )
        )
      );
    }
    const quotePartId = createQuotePart.data.id;

    const createQuotationLine = await upsertQuoteLine(serviceRole, {
      quoteId,
      quotePartId,
      status: d.status,
      description: d.quotePartDescription?.trim()
        ? d.quotePartDescription
        : d.quotePartName,
      methodType: d.defaultMethodType,
      unitOfMeasureCode: d.unitOfMeasureCode ?? "EA",
      quantity: d.quantity,
      taxPercent: d.taxPercent,
      customerPartId: d.customerPartId ?? undefined,
      customerPartRevision: d.customerPartRevision ?? undefined,
      companyId,
      createdBy: userId,
      customFields: setCustomFields(formData)
    });
    if (createQuotationLine.error) {
      throw redirect(
        path.to.quote(quoteId),
        await flash(
          request,
          error(createQuotationLine.error, "Failed to create quote line.")
        )
      );
    }
    throw redirect(path.to.quoteLine(quoteId, createQuotationLine.data.id));
  }

  const validation = await validator(quoteLineValidator).validate(formData);
  if (validation.error) {
    return validationError(validation.error);
  }

  // biome-ignore lint/correctness/noUnusedVariables: suppressed due to migration
  const { id, ...d } = validation.data;
  let configuration = undefined;
  if (d.configuration) {
    try {
      configuration = JSON.parse(d.configuration);
    } catch (err) {
      console.error(err);
    }
  }

  const serviceRole = getCarbonServiceRole();
  const createQuotationLine = await upsertQuoteLine(serviceRole, {
    ...d,
    companyId,
    configuration,
    createdBy: userId,
    customFields: setCustomFields(formData)
  });

  if (createQuotationLine.error) {
    throw redirect(
      path.to.quote(quoteId),
      await flash(
        request,
        error(createQuotationLine.error, "Failed to create quote line.")
      )
    );
  }

  const quoteLineId = createQuotationLine.data.id;
  if (d.methodType === "Make" && d.itemId) {
    const upsertMethod = await upsertQuoteLineMethod(serviceRole, {
      quoteId,
      quoteLineId,
      itemId: d.itemId,
      configuration,
      companyId,
      userId
    });

    if (upsertMethod.error) {
      throw redirect(
        path.to.quoteLine(quoteId, quoteLineId),
        await flash(
          request,
          error(upsertMethod.error, "Failed to create quote line method.")
        )
      );
    }
  }

  throw redirect(path.to.quoteLine(quoteId, quoteLineId));
}
