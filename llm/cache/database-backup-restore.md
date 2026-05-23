# Database Backup and Restore

Full procedure: `llm/workflows/database-backup-restore.md`.

## Stack

- Postgres 15, Supabase-compatible roles (`supabase_admin` / `postgres`, password `postgres` locally).
- Local dev via `crbn` + `docker-compose.dev.yml`; not `supabase start`.

## Quick reference

| Task | Command / location |
|------|-------------------|
| Local port | `crbn status` or `PORT_DB` in `.env.local` |
| Local DB URL | `SUPABASE_DB_URL` in `.env.local` (`postgresql://postgres:postgres@localhost:<PORT_DB>/postgres`) |
| Backup local | `pg_dump` to `.sql` or `--format=custom` `.dump` |
| Backup hosted | Supabase Dashboard → Backups, or `pg_dump` with direct `DATABASE_URL` |
| Restore prod → local | `crbn up --no-migrate` → `psql`/`pg_restore` as `supabase_admin` → `pnpm db:types` |
| Seed file export | `scripts/generate-seed-sql.sh` → `packages/database/supabase/seed.sql` |
| Wipe local data | `crbn reset` |

## Important details

- Use **`supabase_admin`** for restores and migration bookkeeping locally; `postgres` TCP user may lack superuser on current Supabase Postgres images.
- **`pg_dump` does not include Storage bucket files** — back up storage separately if needed.
- **`crbn down`** preserves volumes; **`crbn reset`** destroys Postgres data for the worktree.
- Do not commit backup artifacts or connection strings.
