# Timecard punch ledger + pay-period grid

Last tested: 2026-10-12
Routes: `/x/people/timecard`, `/x/person/$id/timecard`, `/x/settings/people`

## Prerequisites

- `timeCardEnabled` on
- Pay period length + anchor set (Settings → People)
- At least one active employee

## Steps

1. Open `/x/people/timecard`
2. Confirm pay-period prev/next (`YYYY-MM-DD → YYYY-MM-DD`) and employee list
3. Select an employee → day grid (Date | In | Out | Day total)
4. **Insert punch** → datetime-local → Add punch → row appears; manual punches are **bold**
5. Insert enough punches to form pairs; delete a middle punch → In/Out re-pair
6. Open person Timecards tab → same grid + Clock In/Out
7. Settings → People → with Timecards on, save Weekly/Biweekly + anchor date

## Pass criteria

| Check | Result |
|-------|--------|
| Employee + period workspace | Pass |
| Manual insert | Pass |
| Manual bold indicator | Pass (source=manual) |
| Pairing unit tests (double-punch / delete-shift) | Pass |
