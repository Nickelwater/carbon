# @carbon/timeclock

ProPunch / FPC18 WebSocket gateway and punch ingest helpers for Carbon Timecards.

## Always

- Protocol brief: `docs/acroprint-fpc18-websocket-protocol.md`
- Map punches by `employeeJob.enrollId` only — never by display name
- ACK `sendlog` even when enroll id is unmapped; stage into `timeClockPunch`
- Never soft-reset the clock (`initsys` / `cleanuser` / `cleanlog`) in v1
- Interpret ProPunch `time` / emit `cloudtime` in `company.timezone` — never as UTC or the Node process timezone
- Collect Now → `getnewlog` (unread); Collect all punches → `getalllog` (full device log). Duplicates are ignored by punch uniqueness

## Never

- Import `./gateway.server` from browser code
- Accept punches into `timeCardEntry` while the device is disabled
- Store naive `Y-m-d H:i:s` punch strings as UTC (`propunchTimeToIso` must take the company IANA zone)

## Validation Commands

```bash
pnpm --filter @carbon/timeclock typecheck
pnpm --filter @carbon/timeclock test
```

## Env

- `TIMECLOCK_COMPANY_ID` (required to start)
- `TIMECLOCK_HOST` (default `0.0.0.0`)
- `TIMECLOCK_PORT` (default `7788`)
