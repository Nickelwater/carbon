import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";
import { Database } from "../lib/types.ts";

export async function getDefaultPostingGroup(
  client: SupabaseClient<Database>,
  companyId: string
) {
  return await client
    .from("accountDefault")
    .select("*")
    .eq("companyId", companyId)
    .single();
}
