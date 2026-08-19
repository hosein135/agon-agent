#!/usr/bin/env bash
# =============================================================================
# run.sh — Auto setup-or-start for Agon (Linux / macOS / WSL)
#
# Host bootstrap (no OS package manager): curl (static binary if missing) + Nix
# (official installer). PostgreSQL, Zig, Node, and the rest come from flake.nix
# (nixpkgs 25.05). Never apt/dnf/pacman/brew. Never Docker.
#
# Package policy: besides curl + Nix, every tool must be a flake/Nix package.
#
# First run on a machine: ensure curl + Nix, lock flake, download the shell into
# a system cache (~/.cache/agon-agent/<flake-hash>/). That fetch happens once.
# Later runs: reuse the cached lock + profile + print-dev-env (no GitHub / nixpkgs
# re-download, no nix flake metadata). A new clone on the same system reuses it.
#
# Flow inside nix develop:
#   1) Try to reach Postgres
#   2) If not running, init + start a project-local Postgres
#   3) Apply database/schema.sql if the DB is empty
#   4) Build/run Zig backend (port 4000)
#   5) Build and run Next.js production frontend (port 3000).
#      NEXT_DEV=1 ./run.sh  uses next dev (localhost HMR only).
#
# Usage:
#   ./run.sh                # start backend + frontend (auto setup if first time)
#   Ctrl+C                  # stop frontend, backend, and project Postgres
#   ./run.sh --force-setup  # re-fetch Nix packages into the system cache
#   ./run.sh --prep-only    # ensure env + postgres only, do not start servers
#   ./run.sh --help
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}[agon]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[agon]${NC}  $*"; }
error() { echo -e "${RED}[agon]${NC} $*" >&2; }
step()  { echo -e "${CYAN}[agon]${NC}  $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"
READY_MARKER="${SCRIPT_DIR}/.agon-nix-ready"
BOOTSTRAP_DIR="${SCRIPT_DIR}/.agon-bootstrap"
BOOTSTRAP_BIN="${BOOTSTRAP_DIR}/bin"
AGON_DATA="${SCRIPT_DIR}/.agon-data"
FLAKE_DIR="${SCRIPT_DIR}/devops"
CURL_STATIC_VERSION="8.20.0"
# Pin a Nix that still supports flakes. Latest 2.35.x crashes in non-TTY / WSL
# installs (ioctl PTY + NIX_BECOME abort).
NIX_INSTALL_URL="https://releases.nixos.org/nix/nix-2.24.12/install"
SYSTEM_CACHE_ROOT="${XDG_CACHE_HOME:-${HOME}/.cache}/agon-agent"
SYSTEM_CACHE=""
SYSTEM_PROFILE=""
SYSTEM_DEVENV=""
SYSTEM_READY=""
SYSTEM_LOCK=""

FORCE_SETUP=false
PREP_ONLY=false
DO_LAUNCH=false
CLEANING_UP=false
INTERRUPTED=false
FRONTEND_PID=""
BACKEND_PID=""
STARTED_POSTGRES=false

for arg in "$@"; do
    case "$arg" in
        --help|-h)
            sed -n '3,26p' "$0" | sed 's/^# //'
            exit 0 ;;
        --__launch)    DO_LAUNCH=true ;;
        --force-setup) FORCE_SETUP=true ;;
        --prep-only)   PREP_ONLY=true ;;
        *)
            warn "Unknown argument: $arg" ;;
    esac
done

source_nix_profile() {
    if [ -f /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh ]; then
        # shellcheck source=/dev/null
        . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
    elif [ -f "${HOME}/.nix-profile/etc/profile.d/nix.sh" ]; then
        # shellcheck source=/dev/null
        . "${HOME}/.nix-profile/etc/profile.d/nix.sh"
    elif [ -f /etc/profile.d/nix.sh ]; then
        # shellcheck source=/dev/null
        . /etc/profile.d/nix.sh
    fi
}

enable_flakes() {
    # High tarball-ttl: do not re-probe GitHub for flake inputs on every run.
    export NIX_CONFIG="${NIX_CONFIG:-}
experimental-features = nix-command flakes
tarball-ttl = 31536000
warn-dirty = false
"
}

file_hash() {
    local f="$1"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "${f}" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${f}" | awk '{print $1}'
    elif command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 "${f}" | awk '{print $NF}'
    else
        error "Need sha256sum, shasum, or openssl to cache the Nix env."
        return 1
    fi
}

init_system_cache_paths() {
    local key
    if [ ! -f "${FLAKE_DIR}/flake.nix" ]; then
        error "flake.nix missing in ${FLAKE_DIR}"
        exit 1
    fi
    key="$(file_hash "${FLAKE_DIR}/flake.nix")"
    SYSTEM_CACHE="${SYSTEM_CACHE_ROOT}/${key}"
    SYSTEM_PROFILE="${SYSTEM_CACHE}/profile"
    SYSTEM_DEVENV="${SYSTEM_CACHE}/devenv.sh"
    SYSTEM_READY="${SYSTEM_CACHE}/ready"
    SYSTEM_LOCK="${SYSTEM_CACHE}/flake.lock"
}

restore_cached_flake_lock() {
    if [ ! -f "${FLAKE_DIR}/flake.lock" ] && [ -f "${SYSTEM_LOCK}" ]; then
        mkdir -p "${FLAKE_DIR}"
        cp -f "${SYSTEM_LOCK}" "${FLAKE_DIR}/flake.lock"
        info "Reusing flake.lock already fetched on this system"
    fi
}

invalidate_system_nix_cache() {
    rm -f "${READY_MARKER}" "${SYSTEM_READY}" "${SYSTEM_DEVENV}"
    if [ -n "${SYSTEM_PROFILE}" ]; then
        rm -f "${SYSTEM_PROFILE}" "${SYSTEM_PROFILE}"-*-link 2>/dev/null || true
        rm -rf "${SYSTEM_PROFILE}" 2>/dev/null || true
    fi
}

prepend_bootstrap_path() {
    if [ -d "${BOOTSTRAP_BIN}" ]; then
        case ":${PATH}:" in
            *":${BOOTSTRAP_BIN}:"*) ;;
            *) export PATH="${BOOTSTRAP_BIN}:${PATH}" ;;
        esac
    fi
}

nix_env_ready() {
    source_nix_profile || true
    enable_flakes
    prepend_bootstrap_path

    command -v nix >/dev/null 2>&1 || return 1
    command -v curl >/dev/null 2>&1 || return 1
    nix flake --help >/dev/null 2>&1 || return 1
    [ -f "${FLAKE_DIR}/flake.nix" ] || return 1
    [ -n "${SYSTEM_READY}" ] && [ -f "${SYSTEM_READY}" ] || return 1
    [ -e "${SYSTEM_PROFILE}" ] || return 1
    restore_cached_flake_lock
    [ -f "${FLAKE_DIR}/flake.lock" ] || return 1
    return 0
}

http_get() {
    local url="$1" dest="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --proto '=https' --tlsv1.2 -o "${dest}" "${url}"
    else
        error "Cannot download ${url}: curl is required (bootstrap)."
        return 1
    fi
}

extract_tar_xz() {
    local archive="$1" dest="$2"
    mkdir -p "${dest}"
    if tar -xJf "${archive}" -C "${dest}" 2>/dev/null; then
        return 0
    fi
    error "Cannot extract ${archive}: need tar with xz support (tar -xJf)."
    return 1
}

static_curl_asset() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"
    case "${os}" in
        Linux)
            case "${arch}" in
                x86_64|amd64)  echo "curl-linux-x86_64-musl-${CURL_STATIC_VERSION}.tar.xz" ;;
                aarch64|arm64) echo "curl-linux-aarch64-musl-${CURL_STATIC_VERSION}.tar.xz" ;;
                *) error "Unsupported Linux arch for static curl: ${arch}"; return 1 ;;
            esac
            ;;
        Darwin)
            case "${arch}" in
                x86_64)        echo "curl-macos-x86_64-${CURL_STATIC_VERSION}.tar.xz" ;;
                arm64|aarch64) echo "curl-macos-arm64-${CURL_STATIC_VERSION}.tar.xz" ;;
                *) error "Unsupported macOS arch for static curl: ${arch}"; return 1 ;;
            esac
            ;;
        *)
            error "Unsupported OS for static curl: ${os}"
            return 1
            ;;
    esac
}

ensure_curl() {
    prepend_bootstrap_path
    if command -v curl >/dev/null 2>&1; then
        info "curl: $(curl --version 2>/dev/null | head -1)"
        return 0
    fi

    step "curl not found — installing static binary (no OS package manager) ..."
    local asset url archive extract_dir found
    asset="$(static_curl_asset)" || exit 1
    url="https://github.com/stunnel/static-curl/releases/download/${CURL_STATIC_VERSION}/${asset}"
    mkdir -p "${BOOTSTRAP_BIN}" "${BOOTSTRAP_DIR}/tmp"
    archive="${BOOTSTRAP_DIR}/tmp/${asset}"
    extract_dir="${BOOTSTRAP_DIR}/tmp/curl-extract-$$"
    rm -rf "${extract_dir}"
    mkdir -p "${extract_dir}"

    http_get "${url}" "${archive}" || exit 1
    extract_tar_xz "${archive}" "${extract_dir}" || exit 1

    found="$(find "${extract_dir}" -type f -name curl 2>/dev/null | head -1 || true)"
    if [ -z "${found}" ]; then
        error "Static curl archive had no 'curl' binary: ${asset}"
        exit 1
    fi
    cp -f "${found}" "${BOOTSTRAP_BIN}/curl"
    chmod +x "${BOOTSTRAP_BIN}/curl"
    rm -rf "${extract_dir}" "${archive}"
    prepend_bootstrap_path
    info "curl installed (static): $(curl --version 2>/dev/null | head -1)"
}

nix_present() {
    source_nix_profile || true
    if command -v nix >/dev/null 2>&1; then
        return 0
    fi
    if [ -x /nix/var/nix/profiles/default/bin/nix ]; then
        export PATH="/nix/var/nix/profiles/default/bin:${PATH}"
        command -v nix >/dev/null 2>&1 && return 0
    fi
    if [ -x "${HOME}/.nix-profile/bin/nix" ]; then
        export PATH="${HOME}/.nix-profile/bin:${PATH}"
        command -v nix >/dev/null 2>&1 && return 0
    fi
    return 1
}

systemd_running() {
    [ -d /run/systemd/system ] || return 1
    command -v systemctl >/dev/null 2>&1 || return 1
    case "$(systemctl is-system-running 2>/dev/null || true)" in
        running|degraded) return 0 ;;
        *) return 1 ;;
    esac
}

nix_install_flags() {
    # Multi-user (--daemon) needs systemd + a working sudo/PTY. WSL and many
    # containers do not have that — official docs use --no-daemon there.
    if [ "$(uname -s)" = Darwin ]; then
        echo "--daemon --yes"
        return
    fi
    if systemd_running; then
        echo "--daemon --yes"
    else
        echo "--no-daemon --yes"
    fi
}

run_with_pty() {
    # Nix's installer (and nix-env) call tcgetattr; without a TTY they abort:
    # "Inappropriate ioctl for device" / Assertion 'pid != -1'.
    if [ -t 0 ] && [ -t 1 ]; then
        "$@"
        return $?
    fi
    if command -v python3 >/dev/null 2>&1; then
        python3 -c 'import pty,sys; raise SystemExit(pty.spawn(sys.argv[1:]))' "$@"
        return $?
    fi
    if command -v script >/dev/null 2>&1; then
        case "$(uname -s)" in
            Darwin)
                script -q /dev/null "$@"
                return $?
                ;;
            *)
                mkdir -p "${BOOTSTRAP_DIR}/tmp"
                local wrapper st
                wrapper="$(mktemp "${BOOTSTRAP_DIR}/tmp/pty-XXXXXX")"
                {
                    printf '#!/usr/bin/env bash\nset -- '
                    printf '%q ' "$@"
                    printf '\nexec "$@"\n'
                } > "${wrapper}"
                chmod +x "${wrapper}"
                script -q -e -c "${wrapper}" /dev/null
                st=$?
                rm -f "${wrapper}"
                return "${st}"
                ;;
        esac
    fi
    warn "No PTY helper — Nix install may fail without a real terminal"
    "$@"
}

remove_incomplete_nix() {
    if nix_present; then
        return 0
    fi
    if [ ! -e /nix ] && [ ! -e "${HOME}/.nix-profile" ]; then
        return 0
    fi
    warn "Previous Nix install did not finish — clearing the incomplete tree"
    if [ "$(id -u)" -eq 0 ] || { [ -e /nix ] && [ -O /nix ]; } || { [ -e /nix ] && [ -w /nix ]; }; then
        rm -rf /nix "${HOME}/.nix-profile" "${HOME}/.nix-defexpr" "${HOME}/.nix-channels" \
            /etc/nix 2>/dev/null || true
        rm -f /etc/profile.d/nix.sh /etc/profile.d/nix-daemon.sh 2>/dev/null || true
    else
        error "Incomplete Nix files in /nix but this user cannot remove them."
        error "As root run:  rm -rf /nix ~/.nix-profile ~/.nix-defexpr ~/.nix-channels"
        error "Then re-run ./run.sh"
        exit 1
    fi
}

ensure_nix() {
    if nix_present; then
        info "Nix: $(nix --version 2>/dev/null || true)"
        return 0
    fi

    step "Nix not found — installing via official installer (no OS package manager) ..."
    ensure_curl
    remove_incomplete_nix

    export USER="${USER:-$(id -un 2>/dev/null || echo root)}"
    local tmp="${TMPDIR:-/tmp}"
    case "${tmp}" in
        */) ;;
        *) tmp="${tmp}/" ;;
    esac
    export TMPDIR="${tmp}"

    mkdir -p "${BOOTSTRAP_DIR}/tmp"
    local installer flags
    installer="${BOOTSTRAP_DIR}/tmp/nix-installer.sh"
    http_get "${NIX_INSTALL_URL}" "${installer}" || exit 1
    chmod +x "${installer}"

    flags="$(nix_install_flags)"
    info "Nix installer flags: ${flags}"
    # shellcheck disable=SC2086
    if ! run_with_pty sh "${installer}" ${flags}; then
        if [ "${flags}" = "--daemon --yes" ]; then
            warn "Daemon install failed — retrying single-user (--no-daemon)"
            remove_incomplete_nix
            if ! run_with_pty sh "${installer}" --no-daemon --yes; then
                error "Nix installer failed. If /nix was left behind, remove it and re-run."
                exit 1
            fi
        else
            error "Nix installer failed. If /nix was left behind, remove it and re-run."
            exit 1
        fi
    fi

    hash -r 2>/dev/null || true
    source_nix_profile || true
    if ! nix_present; then
        error "Nix installed but not on PATH. Open a new terminal and re-run."
        exit 1
    fi
    info "Nix installed: $(nix --version)"
}

ensure_flakes() {
    enable_flakes
    if ! nix flake --help >/dev/null 2>&1; then
        error "This Nix build does not support flakes. Upgrade Nix, then re-run."
        exit 1
    fi
}

ensure_flake_lock() {
    if [ ! -f "${FLAKE_DIR}/flake.nix" ]; then
        error "flake.nix missing in ${FLAKE_DIR}"
        exit 1
    fi
    restore_cached_flake_lock
    if [ ! -f "${FLAKE_DIR}/flake.lock" ]; then
        step "Creating flake.lock (nixpkgs 25.05) — first time on this system ..."
        nix flake lock "${FLAKE_DIR}"
    fi
    mkdir -p "${SYSTEM_CACHE}"
    cp -f "${FLAKE_DIR}/flake.lock" "${SYSTEM_LOCK}"
}

check_host_os() {
    case "$(uname -s)" in
        Linux|Darwin) ;;
        *)
            error "Unsupported OS: $(uname -s). Use Linux, macOS, or WSL."
            return 1
            ;;
    esac
}

realize_nix_shell() {
    mkdir -p "${SYSTEM_CACHE}"
    step "Fetching Nix packages into the system cache (once per machine / flake) ..."
    nix develop "${FLAKE_DIR}" \
        --profile "${SYSTEM_PROFILE}" \
        --no-update-lock-file \
        --command true
    if nix print-dev-env "${FLAKE_DIR}" --offline --no-update-lock-file > "${SYSTEM_DEVENV}.tmp"; then
        mv -f "${SYSTEM_DEVENV}.tmp" "${SYSTEM_DEVENV}"
    else
        rm -f "${SYSTEM_DEVENV}.tmp"
        warn "nix print-dev-env failed — later runs will use nix develop --offline"
    fi
    cp -f "${FLAKE_DIR}/flake.lock" "${SYSTEM_LOCK}"
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "${SYSTEM_READY}"
    date -u +"%Y-%m-%dT%H:%M:%SZ" > "${READY_MARKER}"
    info "Nix packages cached on this system → ${SYSTEM_CACHE}"
}

setup_first_time() {
    step "First-time (or incomplete) setup — preparing Agon Nix environment ..."
    ensure_curl
    ensure_nix
    ensure_flakes
    ensure_flake_lock
    check_host_os
    realize_nix_shell
}

dir_chmod_0700_works() {
    local base="$1" probe mode
    mkdir -p "${base}" || return 1
    probe="${base}/.perm-probe-$$"
    mkdir "${probe}" || return 1
    chmod 0700 "${probe}" 2>/dev/null || {
        rmdir "${probe}" 2>/dev/null || true
        return 1
    }
    mode="$(stat -c '%a' "${probe}" 2>/dev/null || stat -f '%OLp' "${probe}" 2>/dev/null || echo "")"
    rm -rf "${probe}"
    [ "${mode}" = "700" ]
}

choose_agon_data() {
    local project_data="${SCRIPT_DIR}/.agon-data"
    if [ -n "${AGON_DATA_OVERRIDE:-}" ]; then
        AGON_DATA="${AGON_DATA_OVERRIDE}"
        return
    fi
    if dir_chmod_0700_works "${project_data}"; then
        AGON_DATA="${project_data}"
        return
    fi
    # /mnt/c (WSL/drvfs/9p) cannot honor 0700 — Postgres initdb refuses that path.
    AGON_DATA="${XDG_DATA_HOME:-${HOME}/.local/share}/agon-agent"
    mkdir -p "${AGON_DATA}"
    chmod 0700 "${AGON_DATA}" 2>/dev/null || true
    if [ "${AGON_PG_RELOC_WARNED:-}" != "1" ]; then
        warn "Project is on a Windows mount — Postgres data → ${AGON_DATA}/pg"
        AGON_PG_RELOC_WARNED=1
    fi
}

# Hostnames/IPs browsers use besides localhost. Next.js 15+ 403s /_next/static
# unless they appear in allowedDevOrigins.
collect_dev_origins() {
    local ips="" 
    if command -v hostname >/dev/null 2>&1; then
        ips="$(hostname -I 2>/dev/null || true)"
    fi
    if command -v ip >/dev/null 2>&1; then
        ips="${ips} $(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true)"
    fi
    if command -v ipconfig.exe >/dev/null 2>&1; then
        ips="${ips} $(ipconfig.exe 2>/dev/null | tr -d '\r' | awk '/IPv4 Address/ {print $NF}' || true)"
    fi
    printf '%s\n' ${ips} 2>/dev/null | awk '
        $1 ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ && $1 !~ /^127\./ { print $1 }
    ' | sort -u | paste -sd, - || true
}

export_runtime_env() {
    choose_agon_data
    mkdir -p "${AGON_DATA}"
    export PGHOST="${PGHOST:-127.0.0.1}"
    export PGPORT="${PGPORT:-5432}"
    export PGUSER="${PGUSER:-agon}"
    export PGPASSWORD="${PGPASSWORD:-agon}"
    export PGDATABASE="${PGDATABASE:-agon}"
    # Do not keep PGDATA from the Nix shellHook — it points at $PWD/.agon-data/pg.
    export AGON_PGDATA="${AGON_PGDATA:-${AGON_DATA}/pg}"
    export PGDATA="${AGON_PGDATA}"
    export DATABASE_URL="${DATABASE_URL:-host=${PGHOST} port=${PGPORT} dbname=${PGDATABASE} user=${PGUSER} password=${PGPASSWORD}}"
    export BACKEND_PORT="${BACKEND_PORT:-4000}"
    export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:${BACKEND_PORT}}"
    export PORT="${PORT:-3000}"
    export HOST="${HOST:-0.0.0.0}"
    export ALLOWED_DEV_ORIGINS="${ALLOWED_DEV_ORIGINS:-$(collect_dev_origins)}"
    export NEXT_TELEMETRY_DISABLED=1
    sanitize_ld_library_path
}

# Host tools such as /usr/bin/env crash if Nix glibc is on LD_LIBRARY_PATH
# (__tunable_is_initialized / GLIBC_PRIVATE). Keep glibc only on ld.so --library-path.
sanitize_ld_library_path() {
    local in="${LD_LIBRARY_PATH:-}" out="" p oldifs
    oldifs="${IFS}"
    IFS=':'
    set -f
    for p in ${in}; do
        case "${p}" in
            *glibc*) continue ;;
            *ld-linux*) continue ;;
            "") continue ;;
        esac
        if [ -z "${out}" ]; then
            out="${p}"
        else
            out="${out}:${p}"
        fi
    done
    set +f
    IFS="${oldifs}"
    export LD_LIBRARY_PATH="${out}"
}

postgres_ready() {
    command -v pg_isready >/dev/null 2>&1 || return 1
    pg_isready -h "${PGHOST}" -p "${PGPORT}" >/dev/null 2>&1
}

db_query_ok() {
    psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -Atqc 'SELECT 1' >/dev/null 2>&1
}

schema_ready() {
    local n
    n="$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='admins'" 2>/dev/null || echo 0)"
    [ "${n}" = "1" ]
}

ensure_postgres() {
    export_runtime_env
    if ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1; then
        error "PostgreSQL tools missing. Enter via: nix develop ${FLAKE_DIR}"
        exit 1
    fi

    if postgres_ready; then
        info "Postgres already reachable at ${PGHOST}:${PGPORT}"
    else
        step "Postgres not running — setting up a project-local instance ..."
        mkdir -p "${AGON_DATA}"
        if [ ! -f "${PGDATA}/PG_VERSION" ]; then
            step "initdb → ${PGDATA}"
            initdb -D "${PGDATA}" --auth=trust --username="${PGUSER}" --encoding=UTF8 --locale=C
        fi
        pg_ctl -D "${PGDATA}" -l "${AGON_DATA}/postgres.log" \
            -o "-p ${PGPORT} -h ${PGHOST} -k ${AGON_DATA} -c max_connections=500 -c superuser_reserved_connections=3" start
        STARTED_POSTGRES=true
        local i
        for i in $(seq 1 30); do
            if postgres_ready; then
                break
            fi
            sleep 1
        done
        if ! postgres_ready; then
            error "Postgres failed to start. See ${AGON_DATA}/postgres.log"
            tail -n 40 "${AGON_DATA}/postgres.log" >&2 || true
            exit 1
        fi
        info "Project Postgres is up (${PGHOST}:${PGPORT})"
    fi

    if ! db_query_ok; then
        step "Creating database «${PGDATABASE}» ..."
        createdb -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" "${PGDATABASE}" 2>/dev/null || true
    fi

    if ! schema_ready; then
        step "Applying ${SCRIPT_DIR}/database/schema.sql ..."
        psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
            -v ON_ERROR_STOP=1 -f "${SCRIPT_DIR}/database/schema.sql"
        info "Schema applied."
    else
        info "Database schema already present."
    fi

    # Additive session table for existing databases (CREATE IF NOT EXISTS).
    psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS sessions (
    id              BIGSERIAL PRIMARY KEY,
    token           TEXT NOT NULL UNIQUE,
    account_type    TEXT NOT NULL,
    account_id      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ,
    revoke_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_account_live_idx
    ON sessions (account_type, account_id)
    WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token);
CREATE TABLE IF NOT EXISTS uploads (
    id               BIGSERIAL PRIMARY KEY,
    public_id        TEXT NOT NULL UNIQUE,
    original_name    TEXT NOT NULL DEFAULT '',
    content_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
    kind             TEXT NOT NULL DEFAULT 'file',
    unit_name        TEXT NOT NULL DEFAULT '',
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    created_by       TEXT NOT NULL DEFAULT '',
    byte_size        INTEGER NOT NULL DEFAULT 0,
    content          BYTEA NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_created_at_idx ON uploads (created_at);
CREATE INDEX IF NOT EXISTS uploads_block_idx ON uploads (block_number, block_direction);
CREATE INDEX IF NOT EXISTS uploads_kind_idx ON uploads (kind);
SQL
}

nix_ld_linux() {
    local probe ld
    for probe in "$(command -v psql 2>/dev/null)" "$(command -v pg_ctl 2>/dev/null)" "$(command -v zig 2>/dev/null)"; do
        [ -n "${probe}" ] && [ -e "${probe}" ] || continue
        ld="$(ldd "${probe}" 2>/dev/null | awk '/ld-linux/{print $1; exit}')"
        case "${ld}" in
            /nix/store/*)
                [ -x "${ld}" ] || continue
                printf '%s\n' "${ld}"
                return 0
                ;;
        esac
        ld="$(ldd "${probe}" 2>/dev/null | awk '/ld-linux/{print $3; exit}')"
        case "${ld}" in
            /nix/store/*)
                [ -x "${ld}" ] || continue
                printf '%s\n' "${ld}"
                return 0
                ;;
        esac
    done
    return 1
}

start_backend() {
    step "Building Zig backend ..."
    (
        cd "${SCRIPT_DIR}/backend"
        zig build -Doptimize=ReleaseSafe
    )
    local bin="${SCRIPT_DIR}/backend/zig-out/bin/agon-backend"
    if [ ! -x "${bin}" ]; then
        error "Backend binary missing: ${bin}"
        exit 1
    fi
    step "Starting Zig API on :${BACKEND_PORT} ..."
    # Zig links host libc; Nix libpq needs Nix glibc. Run through Nix's ld.so
    # so libc/libpq come from the same store (avoids GLIBC_2.38 not found).
    local nix_ld="" nix_glibc_lib="" lib_path=""
    nix_ld="$(nix_ld_linux || true)"
    if [ -n "${nix_ld}" ]; then
        nix_glibc_lib="$(dirname "${nix_ld}")"
        lib_path="${nix_glibc_lib}:${LD_LIBRARY_PATH:-}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
        info "Launching backend with Nix glibc (${nix_glibc_lib})"
        nohup env \
            DATABASE_URL="${DATABASE_URL}" \
            HOST="${HOST}" \
            PORT="${BACKEND_PORT}" \
            "${nix_ld}" --library-path "${lib_path}" "${bin}" \
            >"${AGON_DATA}/backend.log" 2>&1 &
    else
        nohup env \
            DATABASE_URL="${DATABASE_URL}" \
            HOST="${HOST}" \
            PORT="${BACKEND_PORT}" \
            "${bin}" >"${AGON_DATA}/backend.log" 2>&1 &
    fi
    echo $! >"${AGON_DATA}/backend.pid"
    BACKEND_PID="$(cat "${AGON_DATA}/backend.pid")"
    local i
    for i in $(seq 1 40); do
        if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1; then
            info "Backend healthy: http://127.0.0.1:${BACKEND_PORT}/api/health"
            return 0
        fi
        sleep 0.5
    done
    error "Backend did not become ready. Last log lines:"
    tail -n 40 "${AGON_DATA}/backend.log" >&2 || true
    exit 1
}

file_is_elf() {
    local f="${1:-}" magic
    [ -f "${f}" ] || return 1
    magic="$(od -An -N4 -tx1 "${f}" 2>/dev/null | tr -d ' \n')"
    [ "${magic}" = "7f454c46" ]
}

nix_elf_library_path() {
    local nix_ld
    nix_ld="$(nix_ld_linux || true)"
    if [ -z "${nix_ld}" ]; then
        printf '%s\n' "${LD_LIBRARY_PATH:-}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
        return 0
    fi
    printf '%s\n' "$(dirname "${nix_ld}"):${LD_LIBRARY_PATH:-}${LIBRARY_PATH:+:${LIBRARY_PATH}}"
}

# WSL often cannot exec Nix ELFs directly (ENOEXEC). Load them with Nix's ld.so.
# Do not export LD_LIBRARY_PATH — that poisons host binaries like /usr/bin/env.
run_nix_elf() {
    local elf="$1"
    shift
    local nix_ld lib_path
    nix_ld="$(nix_ld_linux || true)"
    if [ -n "${nix_ld}" ] && file_is_elf "${elf}"; then
        lib_path="$(nix_elf_library_path)"
        "${nix_ld}" --library-path "${lib_path}" "${elf}" "$@"
    else
        "${elf}" "$@"
    fi
}

is_unix_node() {
    local n="${1:-}"
    [ -n "${n}" ] && [ -x "${n}" ] || return 1
    case "${n}" in
        *.exe|*.cmd|*.bat|/mnt/[a-zA-Z]/*|*/nix-bin/node|*ld-linux*) return 1 ;;
    esac
    return 0
}

agon_node() {
    local n p oldifs
    n="$(command -v node 2>/dev/null || true)"
    if is_unix_node "${n}"; then
        printf '%s\n' "${n}"
        return 0
    fi
    oldifs="${IFS}"
    IFS=':'
    for p in ${PATH}; do
        IFS="${oldifs}"
        if is_unix_node "${p}/node"; then
            printf '%s\n' "${p}/node"
            return 0
        fi
    done
    IFS="${oldifs}"
    error "Nix node binary not found on PATH"
    return 1
}

resolve_node_elf() {
    local n wrapped line
    n="$(agon_node)" || return 1
    n="$(readlink -f "${n}" 2>/dev/null || printf '%s' "${n}")"
    if file_is_elf "${n}"; then
        printf '%s\n' "${n}"
        return 0
    fi
    wrapped="$(dirname "${n}")/.node-wrapped"
    if file_is_elf "${wrapped}"; then
        printf '%s\n' "${wrapped}"
        return 0
    fi
    if [ -f "${n}" ]; then
        line="$(grep -oE '/nix/store/[^[:space:]\"'\'']+' "${n}" 2>/dev/null | while read -r p; do
            case "${p}" in
                *ld-linux*) continue ;;
            esac
            if file_is_elf "${p}"; then
                printf '%s\n' "${p}"
                break
            fi
        done)"
        if [ -n "${line}" ]; then
            printf '%s\n' "${line}"
            return 0
        fi
    fi
    printf '%s\n' "${n}"
}

ensure_node_wrappers() {
    local dir="${AGON_DATA}/nix-bin"
    local node_elf nix_ld lib_path prefix npm_js
    mkdir -p "${dir}"
    node_elf="$(resolve_node_elf)" || return 1
    prefix="$(cd "$(dirname "${node_elf}")/.." && pwd)"
    npm_js="${prefix}/lib/cli.js"
    if [ ! -f "${npm_js}" ]; then
        npm_js="${prefix}/lib/node_modules/npm/bin/npm-cli.js"
    fi
    if [ ! -f "${npm_js}" ]; then
        npm_js="$(command -v npm 2>/dev/null || true)"
        case "${npm_js}" in
            *.cmd|*.bat|/mnt/[a-zA-Z]/*|*/nix-bin/npm) npm_js="" ;;
        esac
    fi
    if [ ! -f "${npm_js}" ]; then
        error "npm CLI not found next to ${node_elf}"
        return 1
    fi
    nix_ld="$(nix_ld_linux || true)"
    lib_path="$(nix_elf_library_path)"
    rm -f "${dir}/node" "${dir}/npm" "${dir}/execpath-patch.cjs"
    # Heredocs/strings from a CRLF run.sh (Windows mount) poison shebangs. Strip CR.
    {
        printf '%s\n' \
            'try {' \
            '  var w = process.env.AGON_NODE_WRAPPER;' \
            '  if (w) {' \
            '    Object.defineProperty(process, "execPath", { configurable: true, enumerable: true, value: w });' \
            '    process.argv[0] = w;' \
            '  }' \
            '} catch (e) {}'
    } | tr -d '\r' > "${dir}/execpath-patch.cjs"
    if [ -n "${nix_ld}" ] && file_is_elf "${node_elf}"; then
        {
            printf '%s\n' \
                '#!/bin/sh' \
                "export AGON_NODE_WRAPPER='${dir}/node'" \
                "exec '${nix_ld}' --library-path '${lib_path}' '${node_elf}' -r '${dir}/execpath-patch.cjs' \"\$@\""
        } | tr -d '\r' > "${dir}/node"
    else
        {
            printf '%s\n' \
                '#!/bin/sh' \
                "export AGON_NODE_WRAPPER='${dir}/node'" \
                "exec '${node_elf}' -r '${dir}/execpath-patch.cjs' \"\$@\""
        } | tr -d '\r' > "${dir}/node"
    fi
    {
        printf '%s\n' \
            '#!/bin/sh' \
            "exec /bin/sh '${dir}/node' '${npm_js}' \"\$@\""
    } | tr -d '\r' > "${dir}/npm"
    chmod 755 "${dir}/node" "${dir}/npm"
    case ":${PATH}:" in
        *":${dir}:"*) ;;
        *) export PATH="${dir}:${PATH}" ;;
    esac
}

run_npm() {
    ensure_node_wrappers || return 1
    /bin/sh "${AGON_DATA}/nix-bin/npm" "$@"
}

start_frontend() {
    step "Starting Next.js frontend on :${PORT} ..."
    cd "${SCRIPT_DIR}/frontend"
    if [ ! -d node_modules ]; then
        step "npm install (first time) ..."
        run_npm install
    fi
    info "Frontend: http://127.0.0.1:${PORT}"
    if [ -n "${ALLOWED_DEV_ORIGINS:-}" ]; then
        echo "${ALLOWED_DEV_ORIGINS}" | tr ',' '\n' | while IFS= read -r origin; do
            [ -n "${origin}" ] && info "Also:     http://${origin}:${PORT}"
        done
    fi
    info "Press Ctrl+C to stop frontend, backend, and Postgres."
    # Stay in this shell (do not exec) so Ctrl+C can stop every service.
    # Do not use `env cmd` — run_npm is a shell function, not a PATH binary.
    case "${SCRIPT_DIR}" in
        /mnt/*)
            # WSL/9p: do not let watchpack walk the Windows volume root.
            export WATCHPACK_POLLING=true
            export CHOKIDAR_USEPOLLING=true
            export CHOKIDAR_INTERVAL=1000
            ;;
    esac
    if [ "${NEXT_DEV:-0}" = "1" ]; then
        BACKEND_URL="${BACKEND_URL}" PORT="${PORT}" HOST="${HOST}" \
            ALLOWED_DEV_ORIGINS="${ALLOWED_DEV_ORIGINS:-}" \
            run_npm run dev -- --port "${PORT}" --hostname "${HOST:-0.0.0.0}" &
    else
        # next dev 403s /_next/static from a public IP. Production does not.
        step "Building production UI (one-time per start; use NEXT_DEV=1 for hot reload) ..."
        rm -rf .next
        if ! BACKEND_URL="${BACKEND_URL}" run_npm run build; then
            error "Frontend production build failed — public IP will keep showing a blank page."
            error "Fix the Next.js error above, then run ./run.sh again (do not use NEXT_DEV=1)."
            exit 1
        fi
        step "Starting production UI on :${PORT} ..."
        BACKEND_URL="${BACKEND_URL}" PORT="${PORT}" HOST="${HOST}" \
            run_npm run start -- --port "${PORT}" --hostname "${HOST:-0.0.0.0}" &
    fi
    FRONTEND_PID=$!
    echo "${FRONTEND_PID}" >"${AGON_DATA}/frontend.pid"
    wait "${FRONTEND_PID}" || true
}

stop_pid() {
    local pid="$1"
    if [ -z "${pid}" ]; then
        return 0
    fi
    if ! kill -0 "${pid}" 2>/dev/null; then
        return 0
    fi
    local child
    if command -v pgrep >/dev/null 2>&1; then
        for child in $(pgrep -P "${pid}" 2>/dev/null || true); do
            stop_pid "${child}"
        done
    fi
    kill -TERM "${pid}" 2>/dev/null || true
}

shutdown_stack() {
    local code=$?
    if [ "${CLEANING_UP}" = true ]; then
        return 0
    fi
    CLEANING_UP=true
    trap - INT TERM EXIT
    echo ""
    if [ "${INTERRUPTED}" = true ]; then
        step "Ctrl+C — stopping frontend, backend, and Postgres ..."
    else
        step "Stopping frontend, backend, and Postgres ..."
    fi

    if [ -z "${FRONTEND_PID}" ] && [ -f "${AGON_DATA}/frontend.pid" ]; then
        FRONTEND_PID="$(cat "${AGON_DATA}/frontend.pid" 2>/dev/null || true)"
    fi
    if [ -z "${BACKEND_PID}" ] && [ -f "${AGON_DATA}/backend.pid" ]; then
        BACKEND_PID="$(cat "${AGON_DATA}/backend.pid" 2>/dev/null || true)"
    fi

    stop_pid "${FRONTEND_PID}"
    stop_pid "${BACKEND_PID}"

    # Next.js spawns extra node processes; sweep by pid files and port.
    if command -v pkill >/dev/null 2>&1; then
        pkill -f "next dev --port ${PORT:-3000}" 2>/dev/null || true
        pkill -f "next start --port ${PORT:-3000}" 2>/dev/null || true
        pkill -f "next-server" 2>/dev/null || true
        pkill -f "agon-backend" 2>/dev/null || true
    fi

    sleep 0.4
    if [ -n "${FRONTEND_PID}" ]; then
        kill -KILL "${FRONTEND_PID}" 2>/dev/null || true
    fi
    if [ -n "${BACKEND_PID}" ]; then
        kill -KILL "${BACKEND_PID}" 2>/dev/null || true
    fi

    if [ -d "${PGDATA:-}" ] && [ -f "${PGDATA}/postmaster.pid" ] && command -v pg_ctl >/dev/null 2>&1; then
        step "Stopping project Postgres ..."
        pg_ctl -D "${PGDATA}" -m fast stop >/dev/null 2>&1 || true
    fi

    rm -f "${AGON_DATA}/frontend.pid" "${AGON_DATA}/backend.pid" 2>/dev/null || true
    info "All stopped."
    if [ "${INTERRUPTED}" = true ]; then
        exit 0
    fi
    exit "${code}"
}

launch_stack() {
    export_runtime_env
    mkdir -p "${AGON_DATA}"
    trap 'INTERRUPTED=true; shutdown_stack' INT TERM
    trap shutdown_stack EXIT
    ensure_postgres
    if [ "${PREP_ONLY}" = true ]; then
        info "Prep-only — Postgres is ready."
        trap - INT TERM EXIT
        return 0
    fi
    start_backend
    start_frontend
}

run_inside_nix() {
    step "Nix environment ready — starting Agon ..."
    # Let the inner --__launch process own Ctrl+C so it can stop postgres + API + UI.
    trap ':' INT TERM
    if [ -f "${SYSTEM_DEVENV}" ]; then
        info "Using Nix env already fetched on this system (no download)"
        (
            set +u
            # shellcheck disable=SC1090
            . "${SYSTEM_DEVENV}"
            cd "${SCRIPT_DIR}"
            bash "${SCRIPT_DIR}/run.sh" --__launch "$@"
        ) || true
    else
        nix develop "${FLAKE_DIR}" \
            --profile "${SYSTEM_PROFILE}" \
            --offline \
            --no-update-lock-file \
            --command bash "${SCRIPT_DIR}/run.sh" --__launch "$@" || true
    fi
    trap - INT TERM
}

main() {
    if [ "${DO_LAUNCH}" = true ]; then
        launch_stack
        exit 0
    fi

    init_system_cache_paths

    if [ "${FORCE_SETUP}" = true ]; then
        invalidate_system_nix_cache
        setup_first_time
    elif nix_env_ready; then
        info "Agon Nix environment already cached on this system — starting."
        source_nix_profile || true
        enable_flakes
        restore_cached_flake_lock
    else
        setup_first_time
    fi

    if [ "${PREP_ONLY}" = true ]; then
        run_inside_nix --prep-only
        info "Prep-only — done."
        exit 0
    fi

    run_inside_nix
}

# When sourced for helpers, do not run main.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
