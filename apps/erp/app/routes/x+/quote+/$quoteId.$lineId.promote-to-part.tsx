import { assertIsPost, error, getCarbonServiceRole } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getQuoteLines, promoteQuotePartToItem } from "~/modules/sales";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { companyId, userId } = await requirePermissions(request, {
    update: "sales"
  });

  const { quoteId, lineId: quoteLineId } = params;
  if (!quoteId || !quoteLineId) throw new Error("quoteId and lineId required");

  const serviceRole = getCarbonServiceRole();
  const linesRes = await getQuoteLines(serviceRole, quoteId);
  if (linesRes.error || !linesRes.data) {
    throw redirect(
      path.to.quoteLine(quoteId, quoteLineId),
      await flash(
        request,
        error(
          linesRes.error ?? new Error("Failed to load lines"),
          "Failed to load quote lines"
        )
      )
    );
  }
  const line = linesRes.data.find((l) => l.id === quoteLineId) as
    | {
        quotePartId?: string;
        customerPartId?: string;
        customerPartRevision?: string;
        quoteId: string;
      }
    | undefined;
  if (!line?.quotePartId) {
    throw redirect(
      path.to.quoteLine(quoteId, quoteLineId),
      quoteId,
      await flash(
        request,
        error(new Error("Line is not a quote-only part"), "Cannot promote")
      )
    );
  }

  const quoteRes = await serviceRole
    .from("quote")
    .select("customerId")
    .eq("id", quoteId)
    .single();
  const customerId = quoteRes.data?.customerId ?? undefined;

  const result = await promoteQuotePartToItem(serviceRole, {
    quotePartId: line.quotePartId,
    quoteLineId,
    companyId,
    userId,
    customerId: customerId ?? null,
    customerPartId: line.customerPartId ?? null,
    customerPartRevision: line.customerPartRevision ?? null
  });

  if (result.error) {
    throw redirect(
      path.to.quoteLine(quoteId, quoteLineId),
      await flash(request, error(result.error, "Failed to promote to part"))
    );
  }

  throw redirect(
    path.to.quoteLine(quoteId, quoteLineId),
    await flash(request, {
      type: "success",
      message: "Quote part promoted to internal part"
    })
  );
}
