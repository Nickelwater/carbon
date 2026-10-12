// SPDX-License-Identifier: AGPL-3.0-only
// Carbon (github.com/crbnos/carbon). Modified or adapted versions of this file,
// including ports, remain AGPLv3; serving them over a network requires releasing their source.

import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import type { Database, Json } from "@carbon/database";
import { getLogger } from "@carbon/logger";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type WebSocket, WebSocketServer } from "ws";
import type { TimeclockEnv } from "./env";
import { propunchTimeToIso } from "./ingest";
import {
  ackReg,
  ackSendlog,
  type CollectLogMode,
  formatCloudtime,
  getCollectLogCommand,
  parseClockMessage,
  type SendlogRecord
} from "./protocol";
import { rebuildTimeCardEntries } from "./rebuild.server";

const log = getLogger("timeclock");

async function getCompanyTimeZone(
  client: SupabaseClient<Database>,
  companyId: string
): Promise<string> {
  const result = await client
    .from("company")
    .select("timezone")
    .eq("id", companyId)
    .single();
  if (result.error || !result.data?.timezone) {
    throw new Error(
      result.error?.message ??
        `Company ${companyId} is missing company.timezone`
    );
  }
  return result.data.timezone;
}

/** Service-role client without `@carbon/auth` (avoids loading the full app env). */
function createServiceRoleClient(): SupabaseClient<Database> {
  const url =
    process.env.SUPABASE_INTERNAL_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL (or SUPABASE_INTERNAL_URL) and SUPABASE_SERVICE_ROLE_KEY are required"
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

type SocketEntry = {
  sn: string;
  socket: WebSocket;
  lastSeenAt: number;
};

const socketsBySn = new Map<string, SocketEntry>();
const lastPollAt = new Map<string, number>();

const SYSTEM_USER = "system";

async function upsertDeviceOnReg(
  client: SupabaseClient<Database>,
  companyId: string,
  sn: string,
  devinfo?: { firmware?: string; modelname?: string }
) {
  const now = new Date().toISOString();
  const existing = await client
    .from("timeClockDevice")
    .select("id")
    .eq("companyId", companyId)
    .eq("serialNumber", sn)
    .maybeSingle();

  if (existing.data) {
    return client
      .from("timeClockDevice")
      .update({
        lastSeenAt: now,
        lastRegAt: now,
        firmware: devinfo?.firmware ?? null,
        modelName: devinfo?.modelname ?? null,
        updatedAt: now,
        updatedBy: SYSTEM_USER
      })
      .eq("id", existing.data.id)
      .eq("companyId", companyId)
      .select("*")
      .single();
  }

  return client
    .from("timeClockDevice")
    .insert({
      companyId,
      serialNumber: sn,
      enabled: false,
      autoPoll: false,
      pollIntervalSeconds: 300,
      lastSeenAt: now,
      lastRegAt: now,
      firmware: devinfo?.firmware ?? null,
      modelName: devinfo?.modelname ?? null,
      createdBy: SYSTEM_USER
    })
    .select("*")
    .single();
}

async function applyPunchToggle(
  client: SupabaseClient<Database>,
  companyId: string,
  punchId: string
) {
  const punchResult = await client
    .from("timeClockPunch")
    .select("*")
    .eq("id", punchId)
    .eq("companyId", companyId)
    .single();

  if (punchResult.error || !punchResult.data) {
    return punchResult;
  }

  const punch = punchResult.data;
  if (punch.status === "applied" || punch.status === "duplicate") {
    return { data: punch, error: null };
  }

  const deviceResult = await client
    .from("timeClockDevice")
    .select("id, enabled")
    .eq("id", punch.deviceId)
    .eq("companyId", companyId)
    .single();

  if (deviceResult.error || !deviceResult.data) {
    return {
      data: null,
      error: deviceResult.error ?? { message: "Device not found" }
    };
  }

  if (!deviceResult.data.enabled) {
    return client
      .from("timeClockPunch")
      .update({ status: "pending", error: null })
      .eq("id", punch.id)
      .eq("companyId", companyId)
      .select("*")
      .single();
  }

  const jobResult = await client
    .from("employeeJob")
    .select("id")
    .eq("companyId", companyId)
    .eq("enrollId", punch.enrollId)
    .maybeSingle();

  if (jobResult.error) {
    return { data: null, error: jobResult.error };
  }

  if (!jobResult.data) {
    return client
      .from("timeClockPunch")
      .update({
        status: "unmapped",
        error: "No employeeJob.enrollId match"
      })
      .eq("id", punch.id)
      .eq("companyId", companyId)
      .select("*")
      .single();
  }

  const employeeId = jobResult.data.id;

  const existingLedger = await client
    .from("timeCardPunch")
    .select("id")
    .eq("companyId", companyId)
    .eq("timeClockPunchId", punch.id)
    .maybeSingle();

  if (existingLedger.error) {
    return { data: null, error: existingLedger.error };
  }

  if (!existingLedger.data) {
    const ledgerInsert = await client.from("timeCardPunch").insert({
      companyId,
      employeeId,
      punchedAt: punch.punchedAt,
      source: "hardware",
      timeClockPunchId: punch.id,
      createdBy: SYSTEM_USER
    });
    if (ledgerInsert.error) {
      return { data: null, error: ledgerInsert.error };
    }
  }

  const rebuild = await rebuildTimeCardEntries(client, {
    companyId,
    employeeId,
    actorUserId: SYSTEM_USER
  });
  if (rebuild.error) {
    return { data: null, error: rebuild.error };
  }

  const entryMatch = await client
    .from("timeCardEntry")
    .select("id")
    .eq("companyId", companyId)
    .eq("employeeId", employeeId)
    .or(`clockIn.eq.${punch.punchedAt},clockOut.eq.${punch.punchedAt}`)
    .maybeSingle();

  return client
    .from("timeClockPunch")
    .update({
      status: "applied",
      employeeId,
      timeCardEntryId: entryMatch.data?.id ?? null,
      error: null
    })
    .eq("id", punch.id)
    .eq("companyId", companyId)
    .select("*")
    .single();
}

async function ingestSendlogRecords(
  client: SupabaseClient<Database>,
  companyId: string,
  sn: string,
  records: SendlogRecord[],
  timeZone: string
) {
  const device = await client
    .from("timeClockDevice")
    .select("id")
    .eq("companyId", companyId)
    .eq("serialNumber", sn)
    .maybeSingle();

  if (!device.data) {
    const created = await upsertDeviceOnReg(client, companyId, sn);
    if (created.error || !created.data) {
      log.error("Failed to create device for sendlog", {
        sn,
        error: created.error
      });
      return;
    }
  }

  const deviceRow = await client
    .from("timeClockDevice")
    .select("id")
    .eq("companyId", companyId)
    .eq("serialNumber", sn)
    .single();

  if (deviceRow.error || !deviceRow.data) {
    return;
  }

  const deviceId = deviceRow.data.id;

  for (const record of records) {
    const enrollId = String(record.enrollid);
    const punchedAt = propunchTimeToIso(record.time, timeZone);
    const mode = record.mode ?? 0;
    const event = record.event ?? 0;
    const inout = record.inout ?? null;

    const insert = await client
      .from("timeClockPunch")
      .insert({
        companyId,
        deviceId,
        serialNumber: sn,
        enrollId,
        punchedAt,
        inout,
        mode,
        event,
        raw: record as unknown as Json,
        status: "pending"
      })
      .select("id")
      .single();

    if (insert.error) {
      const code = (insert.error as { code?: string }).code;
      if (code === "23505") {
        log.info("Duplicate punch ignored", { sn, enrollId, punchedAt });
        continue;
      }
      log.error("Failed to stage punch", { sn, error: insert.error });
      continue;
    }

    if (insert.data) {
      await applyPunchToggle(client, companyId, insert.data.id);
    }
  }

  await client
    .from("timeClockDevice")
    .update({ lastSeenAt: new Date().toISOString() })
    .eq("id", deviceId)
    .eq("companyId", companyId);
}

function sendJson(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function collectSn(
  sn: string,
  mode: CollectLogMode = "new"
): { ok: boolean; error?: string } {
  const entry = socketsBySn.get(sn);
  if (!entry || entry.socket.readyState !== entry.socket.OPEN) {
    return { ok: false, error: `Device ${sn} is not online` };
  }
  sendJson(entry.socket, getCollectLogCommand(mode));
  lastPollAt.set(sn, Date.now());
  return { ok: true };
}

async function runPollTimer(
  client: SupabaseClient<Database>,
  companyId: string
) {
  const devices = await client
    .from("timeClockDevice")
    .select("serialNumber, autoPoll, pollIntervalSeconds, enabled")
    .eq("companyId", companyId)
    .eq("enabled", true)
    .eq("autoPoll", true);

  if (devices.error || !devices.data) {
    return;
  }

  const now = Date.now();
  for (const device of devices.data) {
    const intervalMs = (device.pollIntervalSeconds ?? 300) * 1000;
    const last = lastPollAt.get(device.serialNumber) ?? 0;
    if (now - last < intervalMs) {
      continue;
    }
    const result = collectSn(device.serialNumber);
    if (result.ok) {
      log.info("Auto-poll getnewlog", { sn: device.serialNumber });
    }
  }
}

function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  env: TimeclockEnv
) {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`
  );

  if (req.method === "GET" && url.pathname === "/health") {
    const online = [...socketsBySn.keys()];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        companyId: env.companyId,
        online
      })
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/collect") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body) as { sn?: string; mode?: string };
        if (!parsed.sn) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "sn required" }));
          return;
        }
        const mode: CollectLogMode = parsed.mode === "all" ? "all" : "new";
        const result = collectSn(parsed.sn, mode);
        res.writeHead(result.ok ? 200 : 404, {
          "Content-Type": "application/json"
        });
        res.end(JSON.stringify({ ...result, mode }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "invalid JSON" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not found" }));
}

export function startTimeclockGateway(env: TimeclockEnv) {
  const client = createServiceRoleClient();
  let companyTimeZone: string | null = null;

  async function resolveCompanyTimeZone(): Promise<string> {
    if (companyTimeZone) return companyTimeZone;
    companyTimeZone = await getCompanyTimeZone(client, env.companyId);
    return companyTimeZone;
  }

  const server = createServer((req, res) => handleHttp(req, res, env));
  const wss = new WebSocketServer({ server, path: "/pub/chat" });

  wss.on("connection", (socket) => {
    let boundSn: string | null = null;

    socket.on("message", async (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf8");
      const message = parseClockMessage(raw);
      if (!message || !("cmd" in message)) {
        return;
      }

      const sn = "sn" in message && message.sn ? String(message.sn) : boundSn;
      if (!sn) {
        return;
      }

      boundSn = sn;
      socketsBySn.set(sn, { sn, socket, lastSeenAt: Date.now() });

      try {
        const timeZone = await resolveCompanyTimeZone();
        if (message.cmd === "reg") {
          const reg = message as {
            cmd: "reg";
            sn: string;
            devinfo?: { firmware?: string; modelname?: string };
          };
          await upsertDeviceOnReg(client, env.companyId, sn, reg.devinfo);
          sendJson(socket, ackReg(sn, formatCloudtime(timeZone)));
          return;
        }

        if (message.cmd === "sendlog") {
          const sendlog = message as {
            cmd: "sendlog";
            sn: string;
            record?: SendlogRecord[];
          };
          await ingestSendlogRecords(
            client,
            env.companyId,
            sn,
            sendlog.record ?? [],
            timeZone
          );
          sendJson(socket, ackSendlog(sn, formatCloudtime(timeZone)));
        }
      } catch (error) {
        log.error("Clock message handling failed", { sn, error });
      }
    });

    socket.on("close", () => {
      if (boundSn && socketsBySn.get(boundSn)?.socket === socket) {
        socketsBySn.delete(boundSn);
      }
    });
  });

  const pollHandle = setInterval(() => {
    void runPollTimer(client, env.companyId);
  }, 10_000);

  void resolveCompanyTimeZone()
    .then((timeZone) => {
      log.info("Loaded company timezone for punch ingest", {
        companyId: env.companyId,
        timeZone
      });
    })
    .catch((error) => {
      log.error("Failed to load company timezone", {
        companyId: env.companyId,
        error
      });
    });

  server.listen(env.port, env.host, () => {
    log.info("Timeclock gateway listening", {
      host: env.host,
      port: env.port,
      path: "/pub/chat",
      companyId: env.companyId
    });
  });

  return {
    server,
    wss,
    stop() {
      clearInterval(pollHandle);
      wss.close();
      server.close();
    }
  };
}
