import { serve } from "https://deno.land/std@0.175.0/http/server.ts";
import { z } from "npm:zod@^3.24.1";

import { DB, getConnectionPool, getDatabaseClient } from "../lib/database.ts";
import { corsHeaders } from "../lib/headers.ts";
import { getSupabaseServiceRole } from "../lib/supabase.ts";
import { getNextSequence } from "../shared/get-next-sequence.ts";
import {
  resolveSamplingPlan,
  type SamplingStandard,
} from "../shared/sampling-engine.ts";

const pool = getConnectionPool(1);
const db = getDatabaseClient<DB>(pool);

const payloadValidator = z.object({
  type: z.literal("job"),
  jobId: z.string(),
  companyId: z.string(),
  userId: z.string(),
});

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = payloadValidator.parse(await req.json());

    const client = await getSupabaseServiceRole(
      req.headers.get("Authorization"),
      req.headers.get("carbon-key") ?? "",
      payload.companyId
    );

    const job = await client
      .from("job")
      .select("id, itemId, jobId")
      .eq("id", payload.jobId)
      .eq("companyId", payload.companyId)
      .single();

    if (job.error || !job.data?.itemId) {
      throw new Error("Job not found");
    }

    const [item, jobMakeMethod, companySettings, samplingPlan] =
      await Promise.all([
        client
          .from("item")
          .select("id, readableIdWithRevision, requiresInspection")
          .eq("id", job.data.itemId)
          .single(),
        client
          .from("jobMakeMethod")
          .select("id")
          .eq("jobId", payload.jobId)
          .is("parentMaterialId", null)
          .single(),
        client
          .from("companySettings")
          .select("samplingStandard")
          .eq("id", payload.companyId)
          .single(),
        (client as any)
          .from("itemSamplingPlan")
          .select(
            "type, sampleSize, percentage, aql, inspectionLevel, severity, inspectionDocumentId"
          )
          .eq("itemId", job.data.itemId)
          .eq("companyId", payload.companyId)
          .maybeSingle(),
      ]);

    if (item.error || !item.data?.requiresInspection) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (jobMakeMethod.error || !jobMakeMethod.data?.id) {
      throw new Error("Job make method not found");
    }

    const trackedEntities = await client
      .from("trackedEntity")
      .select("id, quantity, status, attributes")
      .eq("companyId", payload.companyId)
      .eq("attributes->>Job Make Method", jobMakeMethod.data.id)
      .neq("status", "Consumed");

    if (trackedEntities.error) {
      throw trackedEntities.error;
    }

  const lotEntities = (trackedEntities.data ?? []).filter((entity) => {
      const attrs = (entity.attributes ?? {}) as Record<string, unknown>;
      return !attrs["Inspection Lot"];
    });

    if (lotEntities.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lotSize = lotEntities.reduce(
      (sum, entity) => sum + Number(entity.quantity ?? 1),
      0
    );

    const samplingStandard: SamplingStandard =
      (companySettings.data as any)?.samplingStandard ?? "ANSI_Z1_4";

    const plan = samplingPlan.data ?? {
      type: "All",
      sampleSize: null,
      percentage: null,
      aql: null,
      inspectionLevel: "II",
      severity: "Normal",
    };

    const snapshot = resolveSamplingPlan(plan, lotSize, samplingStandard);

    const inspectionId = await db.transaction().execute(async (trx) => {
      const inboundInspectionId = await getNextSequence(
        trx,
        "inboundInspection",
        payload.companyId
      );

      const inserted = await trx
        .insertInto("inboundInspection")
        .values({
          inboundInspectionId,
          sourceType: "Job",
          jobId: payload.jobId,
          receiptLineId: null,
          receiptId: null,
          itemId: job.data!.itemId!,
          itemReadableId: item.data!.readableIdWithRevision ?? null,
          supplierId: null,
          lotSize,
          samplingStandard,
          samplingPlanType: plan.type,
          sampleSize: snapshot.sampleSize,
          acceptanceNumber: snapshot.acceptance,
          rejectionNumber: snapshot.rejection,
          aql: plan.aql ?? null,
          inspectionLevel: plan.inspectionLevel ?? null,
          severity: plan.severity ?? null,
          codeLetter: snapshot.codeLetter,
          inspectionDocumentId: plan.inspectionDocumentId ?? null,
          status: "Pending",
          companyId: payload.companyId,
          createdBy: payload.userId,
        } as any)
        .returning(["id"])
        .executeTakeFirstOrThrow();

      for (const entity of lotEntities) {
        const attrs = {
          ...((entity.attributes ?? {}) as Record<string, unknown>),
          "Inspection Lot": inserted.id,
          Job: payload.jobId,
        };

        await trx
          .updateTable("trackedEntity")
          .set({
            status: "On Hold",
            attributes: attrs,
          })
          .where("id", "=", entity.id!)
          .where("companyId", "=", payload.companyId)
          .execute();
      }

      return inserted.id;
    });

    return new Response(
      JSON.stringify({ success: true, inspectionId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("create-inspection-lot error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
