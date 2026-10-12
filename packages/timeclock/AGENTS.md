# @carbon/timeclock

ProPunch / FPC18 WebSocket gateway and punch ingest helpers for Carbon Timecards.

## Always

- Protocol brief: `docs/acroprint-fpc18-websocket-protocol.md`
- Map punches by `employeeJob.enrollId` only — never by display name
- ACK `sendlog` even when enroll id is unmapped; stage into `timeClockPunch`
- Never soft-reset the clock (`initsys` / `cleanuser` / `cleanlog`) in v1

## Never

- Import `./gateway.server` from browser code
- Accept punches into `timeCardEntry` while the device is disabled

## Validation Commands

```bash
pnpm --filter @carbon/timeclock typecheck
pnpm --filter @carbon/timeclock test
```

## Env

- `TIMECLOCK_COMPANY_ID` (required to start)
- `TIMECLOCK_HOST` (default `0.0.0.0`)
- `TIMECLOCK_PORT` (default `7788`)
