# Feature run: ProPunch timeclock integration

- Date: 2026-10-12
- Mode: approval-per-phase
- Request: I would like to add the hardware punch device integration using the propunch. There should be a page to setup and administer the timeclock itself and support manual and automatic polling to import time entries.
- Phase plan: research [run — Carbon Timecards + Acroprint/ProPunch protocol; light, not broad competitor survey] · spec [run — device admin, badge map, import, poll] · plan [run] · execute [run] · test [run — admin + import user-facing] · self-review [run]

## Decisions

- Gateway process: **Option A** — Carbon-owned WebSocket gateway on 7788 `/pub/chat` (no WSS.exe). User answered grill Q1.
- Admin UI: **People → Timeclocks** (sibling of Timecards; `timeCardEnabled`). User answered grill Q2.
- Company binding v1: **Single-company** — gateway uses one configured `companyId` for all clocks; still store `companyId` on rows for later multi-tenant. User answered grill Q3.
- Enroll id: **`employeeJob.enrollId`** (nullable, unique per company when set). User answered grill Q4.
- Punch → timecard: **Toggle** (no open → clockIn; open → clockOut; ignore inout for v1). User answered grill Q5.
- Polling: **Gateway timer** + Collect Now → `getnewlog`; interval on Timeclocks page. User answered grill Q6.
- Unknown enroll id: **Stage + ACK** raw punch as unmapped; repair UI; reprocess after mapping. User answered grill Q7.
- Device rows: **Auto on `reg` + must enable** before applying punches to `timeCardEntry`. User answered grill Q8.
- Enroll/biometric sync: **Out of scope v1**. User answered grill Q9.
- Gateway config: **Env** (`TIMECLOCK_COMPANY_ID`, host, port). User answered grill Q10.
- Soft reset on first `reg`: **Never in v1** (ACK only). User answered grill Q11.
- Gateway package: **`packages/timeclock`**. User answered grill Q12.
- Settled without grill (research + conventions): permissions `people_*`; tables `timeClockDevice` + `timeClockPunch`; default auto-poll off until enabled; gateway → DB via service role / shared ingest path; copy protocol brief into repo `docs/`.

## Phase log

- research: done — `.ai/research/propunch-timeclock.md` (SAP CICO/HR-PDC, UKG UDM, ADP T&A, Carbon baseline, ProPunch protocol). STE-80 pass done.
- spec: done — grill Q1–Q12 resolved; `.ai/specs/2026-10-12-propunch-timeclock.md`. STE-80 pass done.
- plan: approved — `.ai/plans/2026-10-12-propunch-timeclock.md` (12 tasks). STE-80 pass done.
- execute: Tasks 1–11 committed (`972ea05045`, `275f099f21` + prior docs). Task 12 browser verify done 2026-10-12.
- test: Pass — playbook `.ai/playbooks/propunch-timeclocks.md`. Fixes during test: gateway uses direct Supabase service-role client (no `@carbon/auth` full env); `updateTimeClockDevice` no longer `sanitize()`s partial patches; `TIMECLOCK_COMPANY_ID` must match active ERP company.

## Outcome
- Commits on `timeclock`: protocol brief, database schema/authz, gateway + People UI
- Browser verify: People → Timeclocks loads; sim-clock `reg`/`sendlog`; enrollId; enable/disable; punch toggle opens/closes `timeCardEntry`
- Follow-up commit needed for gateway env fix + `updateTimeClockDevice` sanitize fix (uncommitted at test time)
