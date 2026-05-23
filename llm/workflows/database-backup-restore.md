# Database Backup and Restore

Procedures for backing up and restoring the Carbon Postgres database (Supabase-compatible schema on Postgres 15). Applies to **hosted Supabase** (staging/production) and the **local `crbn` dev stack**.

## Prerequisites

- Postgres client tools installed (`pg_dump`, `pg_restore`, `psql`) — [PostgreSQL downloads](https://www.postgresql.org/download/) or your package manager.
- For local work: stack running (`crbn up`) or intentionally stopped with a preserved volume (`crbn down`).
- For hosted work: database connection string from the Supabase project (Dashboard → **Project Settings** → **Database**). Use the **direct** connection (port `5432`), not the pooler, for `pg_dump` / `pg_restore`.
- Know which environment you are touching. Restoring over production is destructive; require explicit approval and a maintenance window.

## Connection reference

| Environment | How to get the URL | Superuser role for restore |
|-------------|-------------------|----------------------------|
| Local `crbn` | `crbn status`, or `PORT_DB` / `SUPABASE_DB_URL` in `.env.local` | `supabase_admin` (password `postgres`) |
| Hosted Supabase | Dashboard → Database → Connection string (URI) | Use credentials from the dashboard; prefer service-role / DB owner per Supabase docs |

Local defaults (from `.env.local` after `crbn up`):

```text
SUPABASE_DB_URL=postgresql://postgres:postgres@localhost:<PORT_DB>/postgres
```

Migrations and restores that need superuser privileges use `supabase_admin`, not `postgres` — see `packages/dev/src/services/migrations.ts`.

---

## When to back up

| Situation | Recommended action |
|-----------|-------------------|
| Before applying risky migrations to production | Full logical backup (`pg_dump`) or confirm Supabase PITR/scheduled backup exists |
| Before `crbn reset` or deleting a worktree | Dump the worktree DB if you need to keep data |
| Copying production data for local debugging | Export from hosted project; restore locally (see below) |
| Refreshing `seed.sql` for tests | Data-only dump of `public` (see [Seed data export](#seed-data-export)) |
| Routine production protection | Rely on Supabase automated backups (plan-dependent) **and** periodic manual dumps before major releases |

`crbn down` preserves the Docker volume; `crbn reset` and `crbn remove` (with volume wipe) **destroy** local data.

---

## Backup procedures

### 1. Hosted Supabase (staging / production)

#### Option A — Supabase Dashboard (simplest)

1. Open the project in [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to **Database** → **Backups** (availability depends on plan).
3. Download or restore via the UI for point-in-time / daily backups when offered.

#### Option B — Logical backup with `pg_dump` (portable, full control)

Use the **direct** connection string. Replace placeholders with values from the dashboard.

**Full cluster-style dump (custom format, compressed, restorable with `pg_restore`):**

```bash
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --file="carbon-backup-$(date +%Y%m%d-%H%M%S).dump"
```

**Plain SQL (human-readable, restore with `psql`):**

```bash
pg_dump "$DATABASE_URL" \
  --no-owner \
  --file="carbon-backup-$(date +%Y%m%d-%H%M%S).sql"
```

**Schema only** (no row data — useful for diffing structure):

```bash
pg_dump "$DATABASE_URL" --schema-only --no-owner -f carbon-schema.sql
```

**Single schema (`public` only):**

```bash
pg_dump "$DATABASE_URL" --schema=public --no-owner -f carbon-public.sql
```

Store artifacts in your org’s secure backup location (encrypted object storage, not the git repo). Do not commit dumps or connection strings.

> **Note:** `pg_dump` does **not** include Supabase **Storage** bucket files. Back up storage separately (Dashboard, `supabase storage`, or object-store replication) if you need file attachments.

---

### 2. Local `crbn` stack

1. Ensure Postgres is running: `crbn up` (or stack already up from a previous session).
2. Read the port:

   ```bash
   crbn status
   # or
   grep PORT_DB .env.local
   ```

3. Run `pg_dump` against the local instance.

**Full backup (custom format):**

```bash
export PORT_DB=$(grep '^PORT_DB=' .env.local | cut -d= -f2)
PGPASSWORD=postgres pg_dump \
  -h localhost -p "$PORT_DB" -U postgres -d postgres \
  --format=custom --no-owner \
  -f "carbon-local-$(date +%Y%m%d-%H%M%S).dump"
```

**Plain SQL:**

```bash
export PORT_DB=$(grep '^PORT_DB=' .env.local | cut -d= -f2)
PGPASSWORD=postgres pg_dump \
  -h localhost -p "$PORT_DB" -U postgres -d postgres \
  --no-owner \
  -f "carbon-local-$(date +%Y%m%d-%H%M%S).sql"
```

PowerShell equivalent:

```powershell
$port = (Select-String -Path .env.local -Pattern '^PORT_DB=(\d+)$').Matches.Groups[1].Value
$env:PGPASSWORD = "postgres"
pg_dump -h localhost -p $port -U postgres -d postgres --format=custom --no-owner -f "carbon-local-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
```

---

### Seed data export

To regenerate `packages/database/supabase/seed.sql` (data-only, `public` schema, for local seeding):

```bash
# From repo root; adjust port if not using default localhost mode
./scripts/generate-seed-sql.sh
```

The script dumps `postgresql://postgres:postgres@localhost:54322/postgres`. If your worktree uses a dynamic `PORT_DB`, either use `--no-portless` / fixed port `54322`, or run an equivalent `pg_dump` with your actual port:

```bash
pg_dump "postgresql://postgres:postgres@localhost:${PORT_DB}/postgres" \
  --no-comments --data-only --column-inserts -n public \
  > packages/database/supabase/seed.sql
```

Review the diff before committing `seed.sql`; it may contain PII from your local DB.

---

## Restore procedures

### 1. Restore production snapshot **locally** (most common dev workflow)

Use this to debug production issues against real-ish data on your machine.

1. **Export** a backup from hosted Supabase (`pg_dump` or Dashboard), as above.
2. **Boot local stack without migrations** so migration history does not fight the dump’s schema:

   ```bash
   crbn up --no-migrate
   ```

3. Resolve `PORT_DB` from `crbn status` or `.env.local`.
4. **Restore** into the empty/fresh local database.

   **Plain SQL (`.sql`):**

   ```bash
   source .env.local   # bash; sets PORT_DB
   PGPASSWORD=postgres psql \
     -h localhost -p "$PORT_DB" -U supabase_admin -d postgres \
     -f /path/to/backup.sql
   ```

   **Custom format (`.dump`):**

   ```bash
   source .env.local
   PGPASSWORD=postgres pg_restore \
     -h localhost -p "$PORT_DB" -U supabase_admin -d postgres \
     --no-owner --clean --if-exists \
     /path/to/backup.dump
   ```

   PowerShell:

   ```powershell
   $port = (Select-String -Path .env.local -Pattern '^PORT_DB=(\d+)$').Matches.Groups[1].Value
   $env:PGPASSWORD = "postgres"
   psql -h localhost -p $port -U supabase_admin -d postgres -f C:\path\to\backup.sql
   ```

5. **Regenerate types** so TypeScript matches the restored schema:

   ```bash
   pnpm db:types
   ```

6. Optionally regenerate Swagger: `pnpm generate:swagger`.

7. Start apps and verify login (auth users live in `auth` schema; production dumps include them, seed-only restores may not).

**Troubleshooting local restore**

| Symptom | Likely fix |
|---------|------------|
| Permission errors on `auth` / `storage` schemas | Use `supabase_admin`, not `postgres` |
| Migrations re-applied on next `crbn up` | You used `crbn up` without `--no-migrate`; reset volume and repeat with `--no-migrate` |
| `remote migration versions not found` after restore | Dump’s `supabase_migrations.schema_migrations` does not match local files; align branch with dump source or repair manually (see `packages/dev/src/services/migrations.ts`) |
| Port connection refused | Run `crbn status`; stack not up |
| Duplicate key / already exists | Drop and recreate: `crbn reset` then `crbn up --no-migrate` and restore again |

---

### 2. Restore into a **fresh local** database (same machine, clean volume)

1. Wipe and boot without migrations:

   ```bash
   crbn reset
   crbn up --no-migrate
   ```

2. Follow steps 3–5 in [Restore production snapshot locally](#1-restore-production-snapshot-locally-most-common-dev-workflow).

---

### 3. Restore **hosted** Supabase (staging / production)

> **Warning:** Restoring to a live project overwrites data. Coordinate with the team, disable traffic if needed, and confirm backup retention.

**Preferred:** Use Supabase Dashboard **Database** → **Backups** / point-in-time recovery when your plan supports it.

**Manual `pg_restore` / `psql` to hosted DB:**

1. Create a maintenance backup of the **current** state first.
2. Use the direct connection string with sufficient privileges.
3. For custom-format dumps:

   ```bash
   pg_restore --dbname="$DATABASE_URL" --no-owner --clean --if-exists backup.dump
   ```

4. For plain SQL:

   ```bash
   psql "$DATABASE_URL" -f backup.sql
   ```

5. Run any pending migrations if the dump is **older** than the codebase:

   ```bash
   pnpm db:migrate
   ```

6. Verify application health, RLS, auth, and edge functions.

Supabase may restrict superuser operations; if restore fails, use Dashboard restore or contact Supabase support for PITR.

---

### 4. Restore local backup to local (disaster recovery on one worktree)

Same as [Restore production snapshot locally](#1-restore-production-snapshot-locally-most-common-dev-workflow), but use your local `.dump` / `.sql` file. Use `crbn up --no-migrate` if the backup already includes schema + data + migration history.

---

## Post-restore checklist

- [ ] `pnpm db:types` (local or after schema change)
- [ ] `pnpm generate:swagger` if API docs must match
- [ ] Log in to ERP/MES; confirm a known company/user exists
- [ ] Spot-check critical tables (company, users, recent transactions)
- [ ] If storage files matter, confirm Storage buckets / signed URLs work (Postgres restore alone is not enough)
- [ ] Do not commit backup files or `.env` secrets

---

## Related commands

| Command | Effect on data |
|---------|----------------|
| `crbn down` | Stops containers; **keeps** Postgres volume |
| `crbn reset` | Wipes Postgres volume + Redis DB for worktree, then `crbn up` |
| `crbn up --no-migrate` | Starts stack; skips `supabase migration up` |
| `pnpm db:migrate` | Applies pending migrations to running local DB |
| `pnpm db:seed` / `pnpm db:seed:dev` | Runs seed scripts (not a full backup restore) |

See also: [database-migration.md](./database-migration.md), root [README.md](../../README.md) (Local dev CLI → restore section).
