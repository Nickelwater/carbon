import { error } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import { flash } from "@carbon/auth/session.server";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { reorderQuoteLines } from "~/modules/sales";
import { path } from "~/utils/path";

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return redirect(path.to.quotes);
  }

  const { client, userId } = await requirePermissions(request, {
    update: "sales"
  });

  const { quoteId } = params;
  if (!quoteId) throw new Error("Could not find quoteId");

  let body: { lineIds?: string[] };
  try {
    body = await request.json();
  } catch {
    throw redirect(
      path.to.quote(quoteId),
      await flash(request, error(null, "Invalid request body"))
    );
  }

  const lineIds = Array.isArray(body?.lineIds) ? body.lineIds : [];
  if (lineIds.length === 0) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const result = await reorderQuoteLines(client, quoteId, lineIds, userId);

  if (result.error) {
    throw redirect(
      path.to.quote(quoteId),
      await flash(request, error(result.error, "Failed to reorder quote lines"))
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
