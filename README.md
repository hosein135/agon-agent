# Agon Agent

Building / complex management app.

- **Frontend:** Next.js in `frontend/`
- **Backend:** Zig HTTP API in `backend/` (PostgreSQL)
- **Database:** `database/schema.sql`
- **DevOps:** NixOS 25.05 flake in `devops/` (no Docker)

## Run (Linux / macOS / WSL)

```bash
chmod +x run.sh
./run.sh
```

`run.sh` installs curl (static) + Nix if missing. The first run on a machine
downloads the NixOS 25.05 shell into `~/.cache/agon-agent/` (once). Later runs
reuse that cache — no Nix fetch from scratch. Then it starts Postgres (or a
project-local instance), applies the schema, and starts the Zig API (`:4000`)
and Next.js (`:3000`).

```bash
./run.sh --prep-only     # Nix + Postgres only
./run.sh --force-setup   # redo Nix flake lock / ready marker
```

Default system admin after schema seed: **admin** / **admin**

## Layout

| Path | Role |
|------|------|
| `frontend/` | Next.js App Router UI |
| `backend/` | Zig + libpq API |
| `database/schema.sql` | PostgreSQL tables + seed |
| `devops/flake.nix` | nixpkgs 25.05 shell |
| `run.sh` | host bootstrap + start |
