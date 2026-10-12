# ProPunch Hardware Timeclock — implementation plan

**Spec:** `.ai/specs/2026-10-12-propunch-timeclock.md`
**Research:** `.ai/research/propunch-timeclock.md`
**Branch:** `timeclock`

## Progress

- [x] Task 1: Copy protocol brief into the repo
- [x] Task 2: Migration for enrollId, devices, and punches
- [x] Task 3: Authz manifest + authz migration
- [x] Task 4: Regenerate DB types
- [x] Task 5: People models and service for devices, punches, enrollId
- [x] Task 6: Unit tests for punch toggle ingest (`@carbon/timeclock` tests)
- [x] Task 7: Scaffold `@carbon/timeclock` package
- [x] Task 8: Gateway WebSocket + HTTP Collect + poll timer
- [x] Task 9: Optional `crbn up` spawn when env is set
- [x] Task 10: ERP paths, nav, Timeclocks list UI
- [x] Task 11: Enroll ID on Person job form
- [ ] Task 12: Browser verification via `/test` (blocked on commits + TIMECLOCK_COMPANY_ID)

## Dependencies

- Task 2 → Task 3 → Task 4 → Tasks 5–6
- Task 7 → Task 8 (Tasks 5–6 can run in parallel with Task 7 after Task 4)
- Task 8 → Task 9
- Tasks 10–11 need Task 5
- Task 12 needs Tasks 8–11

---

## Task 1: Copy protocol brief into the repo

**Depends on:** none
**Files:**
- Create: `docs/acroprint-fpc18-websocket-protocol.md`
- Copy from (precedent): personal agent store `docs/acroprint-fpc18-websocket-protocol.md`

**Steps:**
1. Copy the agent-store protocol brief to `docs/acroprint-fpc18-websocket-protocol.md`.
2. Keep the content unchanged except fix any Windows-only paths to repo-relative notes if present.

**Verify:**
```bash
test -f /home/nturpin/carbon/docs/acroprint-fpc18-websocket-protocol.md && rg -n '7788|/pub/chat|sendlog' docs/acroprint-fpc18-websocket-protocol.md | head -5
# Expected: file exists; lines mention 7788, /pub/chat, sendlog
```

**Out of scope:** Do not edit the agent-store copy. Do not implement the gateway yet.

---

## Task 2: Migration for enrollId, devices, and punches

**Depends on:** none
**Files:**
- Create: `packages/database/supabase/migrations/<timestamp>_propunch-timeclock.sql` via `pnpm db:migrate:new`
- Modify: none yet (authz is Task 3)

**Steps:**
1. Run `pnpm db:migrate:new propunch-timeclock`.
2. Put this SQL in the new file (idempotent guards). Do **not** write `CREATE POLICY`.

```sql
-- employeeJob.enrollId
ALTER TABLE "employeeJob" ADD COLUMN IF NOT EXISTS "enrollId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "employeeJob_companyId_enrollId_key"
  ON "employeeJob" ("companyId", "enrollId")
  WHERE "enrollId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "timeClockDevice" (
  "id" TEXT NOT NULL DEFAULT id('tcd'),
  "companyId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "name" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "autoPoll" BOOLEAN NOT NULL DEFAULT FALSE,
  "pollIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
  "lastSeenAt" TIMESTAMP WITH TIME ZONE,
  "lastRegAt" TIMESTAMP WITH TIME ZONE,
  "firmware" TEXT,
  "modelName" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "user"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT REFERENCES "user"("id"),
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "timeClockDevice_companyId_idx" ON "timeClockDevice" ("companyId");
CREATE INDEX IF NOT EXISTS "timeClockDevice_createdBy_idx" ON "timeClockDevice" ("createdBy");
ALTER TABLE "timeClockDevice" DROP CONSTRAINT IF EXISTS "timeClockDevice_companyId_serialNumber_key";
ALTER TABLE "timeClockDevice" ADD CONSTRAINT "timeClockDevice_companyId_serialNumber_key"
  UNIQUE ("companyId", "serialNumber");

CREATE TABLE IF NOT EXISTS "timeClockPunch" (
  "id" TEXT NOT NULL DEFAULT id('tcp'),
  "companyId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "enrollId" TEXT NOT NULL,
  "punchedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "inout" INTEGER,
  "event" INTEGER NOT NULL DEFAULT 0,
  "mode" INTEGER NOT NULL DEFAULT 0,
  "raw" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "employeeId" TEXT,
  "timeCardEntryId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("id", "companyId"),
  FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE,
  FOREIGN KEY ("deviceId", "companyId") REFERENCES "timeClockDevice"("id", "companyId") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "timeClockPunch_companyId_idx" ON "timeClockPunch" ("companyId");
CREATE INDEX IF NOT EXISTS "timeClockPunch_deviceId_idx" ON "timeClockPunch" ("deviceId", "companyId");
CREATE INDEX IF NOT EXISTS "timeClockPunch_status_idx" ON "timeClockPunch" ("companyId", "status");
ALTER TABLE "timeClockPunch" DROP CONSTRAINT IF EXISTS "timeClockPunch_idempotency_key";
ALTER TABLE "timeClockPunch" ADD CONSTRAINT "timeClockPunch_idempotency_key"
  UNIQUE ("companyId", "serialNumber", "enrollId", "punchedAt", "mode", "event");
ALTER TABLE "timeClockPunch" DROP CONSTRAINT IF EXISTS "timeClockPunch_status_check";
ALTER TABLE "timeClockPunch" ADD CONSTRAINT "timeClockPunch_status_check"
  CHECK ("status" IN ('pending', 'applied', 'unmapped', 'duplicate', 'error'));
```

3. If `pnpm db:migrate` is unavailable in this environment, STOP and report. Do not invent a local apply path.

**Verify:**
```bash
ls packages/database/supabase/migrations/*propunch-timeclock.sql
# Expected: one new migration file containing timeClockDevice and enrollId
```

**Out of scope:** No RLS policies in this file. No types generation here (Task 4).

---

## Task 3: Authz manifest + authz migration

**Depends on:** Task 2
**Files:**
- Modify: `packages/database/src/authz/manifest.ts` — add `timeClockDevice` and `timeClockPunch`
- Create: generated authz migration via CLI

**Steps:**
1. Add near `timeCardEntry` in `manifest.ts`:

```ts
timeClockDevice: company("people"),
timeClockPunch: company("people"),
```

2. Run `pnpm --filter @carbon/database authz migration propunch-timeclock-authz`.
3. If the command fails because tables are missing locally, run `pnpm db:migrate` first, then retry. If migrate cannot run, STOP and report.

**Verify:**
```bash
rg -n 'timeClockDevice|timeClockPunch' packages/database/src/authz/manifest.ts
ls packages/database/supabase/migrations/*propunch-timeclock-authz*.sql 2>/dev/null || ls packages/database/supabase/migrations/*timeclock*authz*.sql
# Expected: both table keys in manifest; an authz migration file exists
```

**Out of scope:** Do not hand-write `CREATE POLICY` in the Task 2 migration.

---

## Task 4: Regenerate DB types

**Depends on:** Task 3
**Files:**
- Modify: generated files under `packages/database` (via script only)

**Steps:**
1. Run `pnpm db:migrate` so tables + authz sync apply locally.
2. If types did not refresh, run `pnpm run generate:types`.
3. If either command cannot reach the local DB, STOP and report — do not hand-edit `types.ts`.

**Verify:**
```bash
rg -n 'timeClockDevice:|timeClockPunch:|enrollId' packages/database/src/types.ts | head -20
# Expected: table defs and employeeJob.enrollId present
```

**Out of scope:** No app code yet.

---

## Task 5: People models and service for devices, punches, enrollId

**Depends on:** Task 4
**Files:**
- Modify: `apps/erp/app/modules/people/people.models.ts` — add `enrollId` to `employeeJobValidator`; add device validators
- Modify: `apps/erp/app/modules/people/people.service.ts` — device/punch CRUD + ingest apply helper
- Modify: `apps/erp/app/modules/people/index.ts` — export new symbols if needed
- Copy from (precedent): `clockIn` / `clockOut` / `getTimecardEntries` in `people.service.ts`

**Steps:**
1. Add `enrollId: zfd.text(z.string().optional())` to `employeeJobValidator`.
2. Add zod validators: `timeClockDeviceUpdateValidator` (id, name?, enabled, autoPoll, pollIntervalSeconds).
3. Add service functions that take `client` first and return `{ data, error }`:
   - `getTimeClockDevices(client, companyId)`
   - `getTimeClockDevice(client, id, companyId)`
   - `updateTimeClockDevice(client, companyId, userId, input)`
   - `getTimeClockPunches(client, companyId, { status?, deviceId?, limit?, offset? })`
   - `reprocessTimeClockPunch(client, companyId, punchId, userId)`
   - `applyTimeClockPunchToggle(client, args)` — pure apply path used by gateway and reprocess:
     - Look up employee by `employeeJob.enrollId` + `companyId`.
     - If missing → set punch `status = 'unmapped'`.
     - If the device is not enabled, set punch status `pending`.
     - If enabled and mapped and an open entry exists, set `clockOut`.
     - If enabled and mapped and no open entry, insert `clockIn`.
     - Set punch `status = 'applied'`, `employeeId`, and `timeCardEntryId`.
     - On unique violation, set `status = 'duplicate'`.
4. Scope every query with `companyId`.
5. If `applyTimeClockPunchToggle` conflicts with live `clockIn` signatures, STOP and report.

**Verify:**
```bash
pnpm exec turbo run typecheck --filter=erp
# Expected: exit 0 (or only pre-existing unrelated errors — if new errors in people.*, fix them)
```

**Out of scope:** No UI routes. No WebSocket code.

---

## Task 6: Unit tests for punch toggle ingest

**Depends on:** Task 5
**Files:**
- Create: `packages/timeclock/src/ingest.test.ts` (after Task 7) or temporary `apps/erp/app/modules/people/timeclock-ingest.test.ts`
- Copy from (precedent): existing people or utils vitest files

**Steps:**
1. Put pure helpers in `packages/timeclock/src/ingest.ts` after Task 7.
2. Test `decideToggleAction` and idempotency there.
3. If Task 7 is not done, use a temporary people test that imports a server-safe helper only.
4. Cover: unmapped, pending, clockIn, clockOut, duplicate.

**Verify:**
```bash
pnpm --filter @carbon/erp test -- timeclock-ingest || pnpm --filter @carbon/timeclock test
# Expected: tests pass; at least 4 cases green
```

**Out of scope:** No browser tests here.

---

## Task 7: Scaffold `@carbon/timeclock` package

**Depends on:** Task 4
**Files:**
- Create: `packages/timeclock/package.json`
- Create: `packages/timeclock/tsconfig.json`
- Create: `packages/timeclock/AGENTS.md`
- Create: `packages/timeclock/src/index.ts`
- Create: `packages/timeclock/src/env.ts`
- Create: `packages/timeclock/src/protocol.ts`
- Create: `packages/timeclock/src/ingest.ts`
- Copy from (precedent): `packages/logger/package.json`, `packages/printing/package.json`

**Steps:**
1. Create package name `@carbon/timeclock`, private, AGPL SPDX on sources.
2. Dependencies: `@carbon/database`, `@supabase/supabase-js`, `ws` (workspace override `ws@8`), `zod`, `@carbon/logger`.
3. Scripts: `typecheck`, `test` (vitest), `start` (`tsx src/bin.ts`), `lint`.
4. Export `.` for protocol and ingest helpers.
5. Export the Node server only from `./gateway.server`.
6. Read env in `env.ts`: `TIMECLOCK_COMPANY_ID` (required), `TIMECLOCK_HOST` (default `0.0.0.0`), `TIMECLOCK_PORT` (default `7788`).
7. Also read Supabase URL and service role with the same names jobs use.
8. If those env names differ in `.env`, STOP and report the real keys.
9. Run `pnpm install` from the repo root.
10. Run `pnpm --filter @carbon/checks license-headers` on new files.

**Verify:**
```bash
pnpm exec turbo run typecheck --filter=@carbon/timeclock
# Expected: exit 0
```

**Out of scope:** Do not start listening yet (Task 8). Do not wire `crbn up` yet.

---

## Task 8: Gateway WebSocket + HTTP Collect + poll timer

**Depends on:** Tasks 5, 7
**Files:**
- Create: `packages/timeclock/src/gateway.server.ts`
- Create: `packages/timeclock/src/bin.ts`
- Create: `packages/timeclock/src/protocol.test.ts`
- Modify: `packages/timeclock/src/ingest.ts` — call DB via service-role client
- Copy from (precedent): protocol brief `docs/acroprint-fpc18-websocket-protocol.md`

**Steps:**
1. Implement WS path `/pub/chat` on `TIMECLOCK_HOST:TIMECLOCK_PORT`.
2. On `cmd: reg`, upsert `timeClockDevice` for company + `sn` with `createdBy: "system"`.
3. Set `lastRegAt` and `lastSeenAt`. ACK `{ ret: "reg", result: true, cloudtime, sn }`.
4. Never send `initsys`, `cleanuser`, or `cleanlog`.
5. On `cmd: sendlog`, insert each `timeClockPunch` with raw JSON.
6. On unique conflict, mark duplicate. Then call the apply helper. ACK `sendlog`.
7. Add `POST /collect` with body `{ sn }` to send `getnewlog` on the bound socket.
8. Add `GET /health` that returns ok and online serials.
9. Every 10s, poll enabled `autoPoll` devices whose interval has elapsed.
10. Default bind host is `0.0.0.0` for LAN.
11. Unit-test ACK shaping in `protocol.test.ts`.

**Verify:**
```bash
pnpm --filter @carbon/timeclock test
pnpm exec turbo run typecheck --filter=@carbon/timeclock
# Expected: tests pass; typecheck exit 0
```

**Out of scope:** No biometric commands. No soft reset. No multi-company routing.

---

## Task 9: Optional `crbn up` spawn when env is set

**Depends on:** Task 8
**Files:**
- Modify: `packages/dev/src/commands/up.ts` (or the apps supervisor module it uses) — spawn timeclock when `TIMECLOCK_COMPANY_ID` is set
- Copy from (precedent): how `up.ts` spawns stripe listener / other host processes

**Steps:**
1. Find the existing pattern for optional host processes in `packages/dev/src/commands/up.ts`.
2. If `TIMECLOCK_COMPANY_ID` is set, spawn `pnpm --filter @carbon/timeclock start` (or `tsx` entry) with the stack env.
3. Log a clear line: `timeclock gateway listening` or skip reason when env unset.
4. If the spawn API shape is unclear, STOP and report — do not invent a second process manager.

**Verify:**
```bash
rg -n 'TIMECLOCK_COMPANY_ID|timeclock' packages/dev/src/commands/up.ts packages/dev/src -g '*.ts' | head -20
pnpm exec turbo run typecheck --filter=@carbon/dev
# Expected: references exist; typecheck exit 0
```

**Out of scope:** Do not change LAN portless behavior unrelated to timeclock.

---

## Task 10: ERP paths, nav, Timeclocks list UI

**Depends on:** Task 5
**Files:**
- Modify: `apps/erp/app/utils/path.ts` — `peopleTimeclocks`, device action paths
- Modify: `apps/erp/app/modules/people/ui/usePeopleSubmodules.tsx` — Timeclocks route with `setting: "timeCardEnabled"`
- Create: `apps/erp/app/routes/x+/people+/timeclocks.tsx`
- Create: `apps/erp/app/routes/x+/people+/timeclocks.$deviceId.tsx` (optional detail) or actions on list
- Create: `apps/erp/app/modules/people/ui/Timeclocks/TimeclocksTable.tsx`
- Create: `apps/erp/app/modules/people/ui/Timeclocks/index.ts`
- Copy from (precedent): `apps/erp/app/routes/x+/people+/timecard.tsx`, `apps/erp/app/modules/people/ui/Timecards/TimecardsTable.tsx`

**Steps:**
1. Mirror Timecards: require `view: "people"`; redirect if `!timeCardEnabled`.
2. Table columns: serial, name, enabled, autoPoll, lastSeenAt, actions Enable/Disable, Collect Now, Auto-poll toggle.
3. Collect Now: server action POSTs to `http://127.0.0.1:$TIMECLOCK_PORT/collect` with `{ sn }`.
4. Read the port from env on the server (default 7788). If the gateway is down, flash an error.
5. Show unmapped punches (`status=unmapped`) with a reprocess action.
6. Use `ValidatedForm` and row actions like TimecardsTable.
7. Use `LuRadar` (or another `react-icons/lu` icon already used nearby).

**Verify:**
```bash
pnpm exec turbo run typecheck --filter=erp
# Expected: exit 0 for changed people/timeclocks files
```

**Out of scope:** No MES changes. No Settings → Integrations page.

---

## Task 11: Enroll ID on Person job form

**Depends on:** Task 5
**Files:**
- Modify: `apps/erp/app/modules/people/ui/Person/PersonJob.tsx` — Enroll ID input
- Modify: `apps/erp/app/modules/people/people.models.ts` — already has enrollId from Task 5
- Copy from (precedent): other text fields on `PersonJob.tsx`

**Steps:**
1. Add an Enroll ID text field bound to `enrollId`.
2. Ensure `updateEmployeeJob` persists it.
3. Unique violations should surface as a flash/form error (map Postgres unique error to a clear message).

**Verify:**
```bash
pnpm exec turbo run typecheck --filter=erp
# Expected: exit 0
```

**Out of scope:** No biometric enrollment UI.

---

## Task 12: Browser verification via `/test`

**Depends on:** Tasks 8–11
**Files:**
- Create/update: `.ai/playbooks/` only if `/test` writes one

**Steps:**
1. Run the `/test` skill against People → Timeclocks with `timeCardEnabled` on.
2. Verify nav visibility with setting on/off.
3. If no real clock is available, add `packages/timeclock/scripts/sim-clock.ts`.
4. Use the simulator to send `reg` and `sendlog`. Confirm the device row and punches in UI.
5. Record pass/fail against the spec acceptance criteria.

**Verify:**
```bash
# /test produces a pass/fail table in the chat / run record
# Expected: Timeclocks page loads; enable + enrollId + simulated sendlog creates/closes timeCardEntry
```

**Out of scope:** Do not test biometric sync. Do not require production Acroprint `WSS.exe`.

---

## Escape hatches (global)

- If local DB / `pnpm db:migrate` / `generate:types` cannot run, STOP after writing the migration SQL — do not hand-edit `packages/database/src/types.ts`.
- If `ws` cannot be added because of catalog policy, STOP and report — do not switch to an unvetted WebSocket stack.
- If Collect cannot reach the gateway from the ERP server action in cloud deploy, STOP and report — v1 assumes LAN/sidecar colocated with ERP.
