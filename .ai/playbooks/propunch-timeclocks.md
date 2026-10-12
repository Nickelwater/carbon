# ProPunch Timeclocks (People → Timeclocks)

Last tested: 2026-10-12
Routes: `/x/people/timeclocks`, `/x/person/$id/job`
Requires: `timeCardEnabled`, gateway (`TIMECLOCK_COMPANY_ID` = active company), port 7788

## Prerequisites

- Dev stack up (`crbn up`); ERP at `ERP_URL` from `.env.local`
- `companySettings.timeCardEnabled = true` for the active company
- Gateway:
  ```bash
  export TIMECLOCK_COMPANY_ID=<active companyId>  # must match the company in the ERP session
  export SUPABASE_INTERNAL_URL=http://127.0.0.1:$PORT_API
  export SUPABASE_SERVICE_ROLE_KEY=...            # from .env.local
  pnpm --filter @carbon/timeclock start
  ```
- Optional sim clock: `TIMECLOCK_PORT=7788 pnpm --filter @carbon/timeclock exec tsx scripts/sim-clock.ts SIM-SN-001 1001`

## Steps

### 1. Login

- Open `${ERP_URL}/login`, email `test@carbon.ms`, Continue → `/x`

### 2. Timeclocks page loads

- Navigate `${ERP_URL}/x/people/timeclocks`
- Sidebar shows **Timeclocks** under People → Manage (gated by `timeCardEnabled`)
- Table lists devices (Serial, Name, Enabled, Auto-poll, Last seen)

### 3. Register a simulated clock

```bash
TIMECLOCK_PORT=7788 pnpm --filter @carbon/timeclock exec tsx scripts/sim-clock.ts SIM-SN-001 1001
```

- Refresh Timeclocks → row `SIM-SN-001`, **Enabled = No** (auto-reg + must-enable)

### 4. Map enroll ID

- Person → Job → **Enroll ID** = `1001` → Save
- (Or set `employeeJob.enrollId` for that employee/company)

### 5. Enable device

- Row ⋮ → **Enable** → badge **Yes**
- Note: `updateTimeClockDevice` must not `sanitize()` unset fields (nulls NOT NULL columns)

### 6. Punch applies to timecard

```bash
TIMECLOCK_PORT=7788 pnpm --filter @carbon/timeclock exec tsx scripts/sim-clock.ts SIM-SN-001 1001
```

- First punch on enabled+mapped device → `timeClockPunch.status=applied`, open `timeCardEntry`
- Second punch → closes the open entry (toggle)
- Disabled device punches stay `pending` until enabled + reprocess/new punch

### 7. Collect Now

- Row ⋮ → **Collect Now** (needs an online WS socket for that SN; sim disconnects after sendlog)

## Pass criteria (spec)

| Check | Result |
|-------|--------|
| Nav Timeclocks when `timeCardEnabled` | Pass |
| Page loads device table | Pass |
| Sim `reg` creates disabled device | Pass |
| Enroll ID on Person Job | Pass |
| Enable via UI | Pass (after sanitize fix) |
| Mapped punch → clockIn / clockOut toggle | Pass |
| Gateway without full `@carbon/auth` env | Pass (direct service-role client) |
