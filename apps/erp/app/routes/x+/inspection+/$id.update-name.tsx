import { assertIsPost } from "@carbon/auth";
import { requirePermissions } from "@carbon/auth/auth.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request, params }: ActionFunctionArgs) {
  assertIsPost(request);
  const { client, userId } = await requirePermissions(request, {
    update: "quality"
  });

  const { id } = params;
  if (!id) throw new Error("Could not find id");

  const existing = await client
    .from("inspectionDocument")
    .select("status")
    .eq("id", id)
    .single();

  if (existing.data?.status !== "Draft") {
    return {
      success: false,
      error: "Only draft inspection documents can be edited"
    };
  }

  const formData = await request.formData();
  const drawingNumber = String(formData.get("drawingNumber") ?? "").trim();

  const result = await client
    .from("inspectionDocument")
    .update({
      drawingNumber: drawingNumber || null,
      updatedBy: userId,
      updatedAt: new Date().toISOString()
    })
    .eq("id", id);

  if (result.error) {
    return { success: false };
  }

  return { success: true };
}
