// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import type { Database } from "@carbon/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pairPunches } from "./pair";

/**
 * Replace all timeCardEntry rows for an employee with intervals derived from
 * their timeCardPunch ledger (pairing by ascending punchedAt).
 */
export async function rebuildTimeCardEntries(
  client: SupabaseClient<Database>,
  args: {
    companyId: string;
    employeeId: string;
    actorUserId: string;
  }
) {
  const punchesResult = await client
    .from("timeCardPunch")
    .select("id, punchedAt, source, createdBy")
    .eq("companyId", args.companyId)
    .eq("employeeId", args.employeeId)
    .order("punchedAt", { ascending: true });

  if (punchesResult.error) {
    return { data: null, error: punchesResult.error };
  }

  const { segments } = pairPunches(punchesResult.data ?? []);

  const del = await client
    .from("timeCardEntry")
    .delete()
    .eq("companyId", args.companyId)
    .eq("employeeId", args.employeeId);

  if (del.error) {
    return { data: null, error: del.error };
  }

  if (segments.length === 0) {
    return { data: [], error: null };
  }

  const rows = segments.map((segment) => ({
    companyId: args.companyId,
    employeeId: args.employeeId,
    clockIn: segment.clockIn.punchedAt,
    clockOut: segment.clockOut?.punchedAt ?? null,
    createdBy: segment.clockIn.createdBy || args.actorUserId,
    updatedBy: segment.clockOut ? args.actorUserId : null,
    updatedAt: segment.clockOut ? new Date().toISOString() : null
  }));

  const insert = await client.from("timeCardEntry").insert(rows).select("id");
  if (insert.error) {
    return { data: null, error: insert.error };
  }

  return { data: insert.data ?? [], error: null };
}
