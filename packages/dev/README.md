# crbn — Carbon Dev CLI

Per-worktree development environment manager. Each worktree gets its own compose stack (postgres, kong, supabase, inngest, inbucket), port allocation, redis db, and JWT credentials.

## Setup

```bash
source ./setup.sh   # adds crbn to PATH + installs shell wrapper
```

## Commands

### Worktrees

| Command | Description |
|---|---|
| `crbn checkout <branch>` | Switch into worktree for `<branch>`. Creates one if missing (auto-fetches from origin). |
| `crbn checkout -b <branch>` | Create new branch + worktree from `--base` (default HEAD). |
| `crbn checkout <pr-number>` | Fetch PR head from GitHub into `pr-<num>` branch + worktree. |
| `crbn checkout main` | cd into the main checkout (never creates a separate worktree). |
| `crbn new [branch]` | Interactive worktree creation. Optional branch name pre-fills the prompt. |
| `crbn list` | Show all worktrees with stack status. |
| `crbn remove` | Multi-select worktrees to delete (concurrent teardown with progress). |
| `crbn remove --prune` | Also delete the git branch after removing each worktree. |

### Stack

| Command | Description |
|---|---|
| `crbn up` | Boot compose stack + apps. |
| `crbn up --no-portless` | Localhost mode: fixed ports (API `:54321`, ERP `:3000`, MES `:3001`). |
| `crbn up --lan` | LAN mode: same fixed ports, URLs use this machine's IP, apps bind `0.0.0.0`. |
| `crbn up --borrow` | Reuse another worktree's running containers (DB, API, etc). |
| `crbn up --no-apps` | Services only (postgres, kong, supabase, inngest, mail). |
| `crbn up --no-migrate` | Skip database migrations. |
| `crbn up --no-regen` | Skip type/swagger regeneration. |
| `crbn up --pull` | Force `docker compose pull` even if images exist locally. |
| `crbn down` | Stop stack (volumes preserved). |
| `crbn reset` | Wipe volumes + flush redis db, then `up`. |
| `crbn status` | Port assignment + container health. |
| `crbn migrate` | Apply DB migrations against the running stack. |

### Files

| Command | Description |
|---|---|
| `crbn copy <file...>` | Copy file(s) from main checkout into current worktree. |
| `crbn env sync` | Sync files listed in `package.json#crbn.copy` from main checkout. |

## Portless vs Localhost

By default, `crbn up` uses [portless](https://github.com/nicholasgasior/portless) for `.dev` TLS URLs (e.g. `https://erp.dev.dev`). Pass `--no-portless` (or set `CARBON_PORTLESS=0`) for localhost mode with fixed ports:

| Service | Port |
|---|---|
| Supabase API (Kong) | `54321` |
| ERP | `3000` |
| MES | `3001` |

OAuth redirect URIs in localhost mode use `http://localhost:54321/auth/v1/callback`.

`pnpm dev` defaults to `crbn up --no-portless`.

## LAN access (tablets / other devices on your network)

Use **`crbn up --lan`** (or set `CARBON_DEV_LAN=1` / `CARBON_DEV_HOST=192.168.x.x` in `.env` before `crbn up`).

- Disables portless (`.dev` hostnames do not work on other devices).
- Writes `ERP_URL`, `MES_URL`, and `SUPABASE_URL` with your LAN IP.
- Binds ERP/MES dev servers on **`0.0.0.0`** with fixed ports **3000** / **3001** / **54321**.
- Open **`http://<your-ip>:3000`** (ERP) and **`http://<your-ip>:3001`** (MES) from phones or shop-floor devices on the same network.
- **Magic links** use the ERP port (`http://<your-ip>:3000/auth/v1/...`), not `:54321` — you do not need to expose the Supabase API port on the firewall.
- Allow inbound TCP **3000** and **3001** through your OS firewall if connections time out.

After changing LAN settings, run **`crbn down`** then **`crbn up --lan`** so Docker (GoTrue) reloads `API_EXTERNAL_URL` from `.env.local`.

To pin a specific interface IP when auto-detection picks the wrong one:

```bash
CARBON_DEV_HOST=192.168.1.42 crbn up --lan
```

Register OAuth redirect URIs against `http://<your-ip>:54321/auth/v1/callback` if you use Google/Azure login on LAN devices.

## Project naming

Compose projects are prefixed `carbon-<slug>` (e.g. `carbon-feature-foo`). The slug is derived from the worktree directory name and persisted in `.carbon-worktree`.
