# ProPunch Hardware Timeclock Research: Best Practices Survey

## Summary

This survey covers hardware punch ingest into attendance systems. It compares SAP SuccessFactors CICO, SAP HR-PDC, UKG Dimensions UDM, and ADP Workforce Now Time & Attendance. It also records Carbon’s `timeCardEntry` model and the ProPunch / FPC18 WebSocket protocol. Leaders register each clock as a device. They map an enroll id to an employee. They stage raw punches, then pair them into open and close intervals. ProPunch pushes punches on an outbound WebSocket. Carbon can still offer manual and scheduled pull with `getnewlog` / `getalllog`.

## Competitors Surveyed

- **SAP S/4HANA / SuccessFactors** — enterprise reference for terminal time events and badge ids
- **UKG Dimensions (UDM)** — cloud device manager with Collect and scheduled data collection
- **ADP Workforce Now Time & Attendance** — Setup → Timeclocks admin and hosted/device-initiated clocks

## Key Consensus Patterns

### 1. Device registry before punches flow

- **SAP**: CICO registers an OAuth client and optional `terminalId` on each Time Event. HR-PDC tracks terminal context on uploaded events.
- **UKG**: Admins create a device in UDM, assign a Device Configuration Profile, then Initialize Device. Auto-registered devices stay blocked until configured.
- **ADP**: Admins create a timeclock definition, assign a profile, register serial number, then download config.
- **Rationale**: Ops need online status, disable, and per-device actions before punches hit payroll records.

### 2. Explicit badge / enroll id on the employee

- **SAP**: Infotype 0050 stores Time Recording ID Number (`ZAUSW`). CICO terminals usually send `assignmentId` / userId.
- **UKG**: People Information stores Badge Number with effective dates and format rules.
- **ADP**: Employee General holds badge number (up to 15 characters). Clocks validate against a downloaded roster.
- **Rationale**: Hardware never maps by display name. Carbon has no badge field today.

### 3. Device-initiated push is the modern default

- **SAP CICO**: Terminal or middleware pushes Time Events over REST. File import can poll SFTP then push REST.
- **SAP HR-PDC**: SAP requests upload; the subsystem sends batches into `CC1TEV` (poll/upload cycle).
- **UKG**: Device-initiated NetChecks upload punches. Server-initiated mode is legacy.
- **ADP**: Hosted clocks use Device Initiated upload. Legacy Time Collection Manager collects on a PC.
- **Rationale**: ProPunch matches the push model: clock opens `ws://ServerIP:7788/pub/chat` and sends `sendlog`.

### 4. Manual Collect plus automatic collection

- **UKG**: Collect runs one retrieval. Automatic data collection uses an interval. Event Manager schedules Collect and updates.
- **ADP**: Cloud punches upload in minutes. Admins run Collect & Send on the bridge, or Activity Scheduler downloads.
- **SAP**: HR-PDC upload frequency is customer-defined. CICO has no classic “poll clock” button; admins repair failed events in UI.
- **Rationale**: Manual Collect clears backlog. Automatic collection covers steady state. Carbon should expose both for ProPunch pull and for push health.

### 5. Stage raw punches, then pair into intervals

- **SAP CICO**: Time Event → pairing → External Time Data → Time Sheet.
- **SAP HR-PDC**: `CC1TEV` buffer → `TEVEN` / IT 2011 → pair formation.
- **UKG**: Transactions upload to Timekeeping; Totalizer updates the timecard.
- **ADP**: Uploaded punches land on the timecard after a short delay.
- **Rationale**: Carbon `timeCardEntry` is already an interval (`clockIn` / `clockOut`). Hardware ingest should store raw punches, then open or close intervals. Do not invent a second payroll engine.

### 6. Idempotency and unknown badges

- **SAP CICO**: Duplicate assignment + timestamp can fail the REST call. Failed business rules can still leave repairable rows.
- **UKG**: Imports filter duplicates or update existing punches. Clocks enforce minimum punch intervals.
- **ADP**: Unknown badges fail at the clock when the roster is current. Stale roster looks like an unknown badge until download finishes.
- **Rationale**: Key punches by device serial, enroll id, time, mode, and event. Keep unmapped punches visible for admin repair.

## Answers to Research Questions

1. **What entities should Carbon own for devices and punches?** — Device (`sn`, name, online, last seen), enroll id map → `employeeId`, raw punch staging, and `timeCardEntry`. Pattern: UKG device, ADP timeclock definition, SAP staging buffer.

2. **How do leaders map enroll id to employee?** — One enroll id (badge) field on the employee, or a map table. Never infer from name. SAP IT 0050, UKG Badge Number, ADP badge number.

3. **Is ProPunch push or poll?** — Primary path is push (`sendlog` after `reg`). The server can also call `getnewlog` / `getalllog`. User “polling” means Collect (manual), a scheduled job (automatic), and always-on push accept.

4. **How should punches become Carbon timecards?** — Treat each punch as a time event. If the employee has no open `timeCardEntry`, set `clockIn`. If one is open, set `clockOut`. Defer break pairing and overtime rules to a later phase.

5. **Where does device admin live?** — A People or Settings Timeclocks page: list clocks, online status, last sync, Collect Now, auto-poll on/off, name, company binding. Pattern: ADP Setup → Timeclocks and UKG UDM.

6. **What edge cases matter for MVP?** — Unknown `enrollid`, duplicate `sendlog`, clock offline, wrong Server IP, `cloudtime` in the terminal zone. Biometric template sync stays out of MVP.

## Competitor-Specific Details

### SAP

SuccessFactors CICO is push-first REST with Time Event Types and groups. S/4HANA HR-PDC still uses download of mini-master and upload into `CC1TEV`. Duplicate protection differs by stack. Partner certification exists for CICO vendors.

### UKG Dimensions

UDM owns the device lifecycle: profile, Initialize, Update, Collect, and Start/Stop Data Collection. View Transactions supports Resubmit. Badge formats and Punch Interpretation Rules live on the device profile. Third-party clocks use Universal Punches Import or the Bulk Import Punches API.

### ADP Workforce Now

Setup → Timeclocks holds definitions, profiles, and groups. Hosted clocks register by serial. Employee download is manual or scheduled. Unknown badges reject at the device when the roster is loaded.

### Carbon today (baseline)

- Company flag `timeCardEnabled` gates Timecards under People.
- `timeCardEntry` stores `employeeId`, `clockIn`, optional `clockOut`, note, optional `autoCloseShiftId`.
- MES and ERP call `clockIn` / `clockOut` in `people.service`.
- No device table, no badge / enroll field, no ProPunch gateway in-repo.
- Protocol brief (agent store): outbound WebSocket JSON on port **7788**, path `/pub/chat`; commands `reg`, `sendlog`; enroll id on each punch record.

### ProPunch / FPC18 protocol constraints

- Clock dials the server; Carbon (or a sidecar) must own Server IP:7788 or keep `WSS.exe` (Option B).
- Identity on the wire is JSON `sn`. Stock gateway has no mutual auth.
- MVP commands: ACK `reg`, ingest `sendlog`, optional `getnewlog` / `getalllog` for Collect.
- Prefer Option A: Carbon-owned WebSocket service implementing `/pub/chat`.

## Recommended Approach for Carbon

1. **Add a People or Settings Timeclocks admin page** — Register each device by `sn`. Show online status and last seen. Offer Collect Now and auto-poll on/off.
2. **Add enroll id mapping** — Store `enrollid` → `employeeId` per company. Do not match by display name.
3. **Stage raw punches, then update `timeCardEntry`** — Follow the SAP buffer and Carbon interval model. Use idempotent key `(companyId, sn, enrollid, time, mode, event)`.
4. **Accept push always; poll via Collect and a job** — Keep `sendlog` push. Use `getnewlog` / `getalllog` for Collect and scheduled pull.
5. **Ship Option A gateway MVP** — Handle `reg` and `sendlog` first. Defer biometric sync and door commands.
6. **Keep unmapped punches in an error queue** — Follow UKG View Transactions and SAP repairable events. Do not drop unknown enroll ids.

## Sources

- https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-sap/clock-in-clock-out-in-sap-successfactors-time-tracking-overview-and-how-to/ba-p/13498087
- https://learning.sap.com/courses/sap-successfactors-time-management-academy/setting-up-clock-in-clock-out
- https://help.sap.com/docs/HR_RENEWAL/fc1543655f9c422091f7ff85bd372c66/89addd538636424de10000000a174cb4.html
- https://learning.sap.com/courses/time-management-in-sap-hcm-for-s-4hana-1/using-time-recording-systems
- https://userapps.support.sap.com/sap/support/knowledge/en/3145716
- https://userapps.support.sap.com/sap/support/knowledge/en/3313723
- https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/UDM/Introduction.htm
- https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/UDM/Configuration/Configuration_Page.htm
- https://communityfiles.ukg.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/UDM/Configuration/CommunicationSettingsTemplate.htm
- https://customer2.kronos.com/support/kol/onlinehelp-workforcedimensions/en-us/Content/UDM/Actions/Actions_top.htm
- https://customer2.kronos.com/support/KOL/OnlineHelp-WorkforceDimensions/en-us/Content/PeopleInfo/Devices.htm
- https://developer.ukg.com/wfm/reference/bulk-import-punches
- https://otcdc1.adp.com/ezlmhelp/v18_30/wfn/general/standardui/en-us/as_help/as/timeclocks-intro.htm
- https://otcdc1.adp.com/ezLMHelp/V18_30/WFN/General/StandardUI/en-US/as_help/as/add_timeclock_hosted.htm
- https://sbshrs.adpinfo.com/hubfs/SBS%20TLM/Timeclock%20Guide%20-%20ATS%20-%20Downloading%20Employee%20Badge%20Information%20to%20a%20Hosted%20Timeclock-1.pdf
- https://sbshrs.adpinfo.com/tlmsupport/faq
- Agent store protocol brief: `docs/acroprint-fpc18-websocket-protocol.md` (personal store copy)
- Carbon docs: `docs/content/docs/reference/people.mdx` (Time cards)
- Carbon schema: `timeCardEntry` in `packages/database/src/types.ts`
