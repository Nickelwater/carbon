import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function rewireSamplingPlansToActiveInspectionDocument(
  client: SupabaseClient<Database>,
  activatedDocumentId: string,
  companyId: string
) {
  const docResult = await client
    .from("inspectionDocument")
    .select("id, documentFamilyId")
    .eq("id", activatedDocumentId)
    .eq("companyId", companyId)
    .single();

  if (docResult.error || !docResult.data) {
    return { data: null, error: docResult.error };
  }

  const familyId = docResult.data.documentFamilyId;
  const siblings = await client
    .from("inspectionDocument")
    .select("id")
    .eq("documentFamilyId", familyId)
    .eq("companyId", companyId)
    .neq("id", activatedDocumentId);

  const siblingIds = (siblings.data ?? []).map((row) => row.id);
  if (siblingIds.length === 0) {
    return { data: { updated: 0 }, error: null };
  }

  const updateResult = await (client as any)
    .from("itemSamplingPlan")
    .update({ inspectionDocumentId: activatedDocumentId })
    .eq("companyId", companyId)
    .in("inspectionDocumentId", siblingIds)
    .select("itemId");

  return {
    data: { updated: (updateResult.data ?? []).length },
    error: updateResult.error
  };
}
