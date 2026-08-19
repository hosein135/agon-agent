-- =============================================================================
-- Agon Agent — PostgreSQL schema
-- Usage (from repo root, Nix env):
--   psql -v ON_ERROR_STOP=1 -d agon -f database/schema.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Core people / auth
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admins (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password      TEXT NOT NULL,
    full_name     TEXT NOT NULL DEFAULT '',
    role          TEXT NOT NULL DEFAULT 'system_admin',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS residents (
    id               BIGSERIAL PRIMARY KEY,
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    unit_name        TEXT NOT NULL,
    floor            TEXT NOT NULL DEFAULT '',
    occupancy        TEXT NOT NULL DEFAULT 'مالک',
    first_name       TEXT NOT NULL DEFAULT '',
    last_name        TEXT NOT NULL DEFAULT '',
    phone            TEXT NOT NULL DEFAULT '',
    pin              TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS residents_unit_idx ON residents (unit_name);
CREATE INDEX IF NOT EXISTS residents_block_idx ON residents (block_number, block_direction);

CREATE TABLE IF NOT EXISTS resident_people_counts (
    id                     BIGSERIAL PRIMARY KEY,
    unit_name              TEXT NOT NULL UNIQUE,
    people_count           INTEGER NOT NULL DEFAULT 1,
    block_number           TEXT NOT NULL DEFAULT '',
    block_direction        TEXT NOT NULL DEFAULT '',
    resident_id            BIGINT,
    membership_request_id  BIGINT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resident_occupant_flags (
    id               BIGSERIAL PRIMARY KEY,
    resident_id      BIGINT NOT NULL UNIQUE,
    unit_name        TEXT NOT NULL DEFAULT '',
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    is_occupant      BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS membership_requests (
    id               BIGSERIAL PRIMARY KEY,
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    unit_name        TEXT NOT NULL,
    floor            TEXT NOT NULL DEFAULT '',
    occupancy        TEXT NOT NULL DEFAULT 'مالک',
    first_name       TEXT NOT NULL DEFAULT '',
    last_name        TEXT NOT NULL DEFAULT '',
    phone            TEXT NOT NULL DEFAULT '',
    pin              TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'دریافت شده',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS complex_manager_requests (
    id            BIGSERIAL PRIMARY KEY,
    complex_name  TEXT NOT NULL,
    blocks_count  TEXT NOT NULL DEFAULT '',
    units_count   TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    password      TEXT NOT NULL DEFAULT '',
    first_name    TEXT NOT NULL DEFAULT '',
    last_name     TEXT NOT NULL DEFAULT '',
    national_id   TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'دریافت شده',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS complex_managers (
    id            BIGSERIAL PRIMARY KEY,
    complex_name  TEXT NOT NULL UNIQUE,
    blocks_count  TEXT NOT NULL DEFAULT '',
    units_count   TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    password      TEXT NOT NULL DEFAULT '',
    full_name     TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS block_managers (
    id               BIGSERIAL PRIMARY KEY,
    block_number     TEXT NOT NULL,
    block_direction  TEXT NOT NULL,
    full_name        TEXT NOT NULL DEFAULT '',
    password         TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (block_number, block_direction)
);

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

CREATE TABLE IF NOT EXISTS board_members (
    id              BIGSERIAL PRIMARY KEY,
    complex_name    TEXT NOT NULL DEFAULT '',
    full_name       TEXT NOT NULL DEFAULT '',
    title           TEXT NOT NULL DEFAULT '',
    responsibility  TEXT NOT NULL DEFAULT '',
    phone           TEXT NOT NULL DEFAULT '',
    password        TEXT NOT NULL DEFAULT '',
    permissions     JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'active',
    created_by      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS board_work_orders (
    id                  BIGSERIAL PRIMARY KEY,
    complex_name        TEXT NOT NULL DEFAULT '',
    block_number        TEXT NOT NULL DEFAULT '',
    block_direction     TEXT NOT NULL DEFAULT '',
    title               TEXT NOT NULL DEFAULT '',
    body                TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'ثبت‌شده',
    assigned_member_id  BIGINT,
    created_by          TEXT NOT NULL DEFAULT '',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bills (
    id               BIGSERIAL PRIMARY KEY,
    unit_name        TEXT NOT NULL DEFAULT '',
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    title            TEXT NOT NULL DEFAULT '',
    amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    due_date         TEXT,
    description      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'پرداخت‌نشده',
    paid_at          TIMESTAMPTZ,
    created_by       TEXT NOT NULL DEFAULT '',
    created_by_role  TEXT NOT NULL DEFAULT 'manager',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bills_unit_idx ON bills (unit_name);
CREATE INDEX IF NOT EXISTS bills_block_idx ON bills (block_number, block_direction);

CREATE TABLE IF NOT EXISTS receipts (
    id               BIGSERIAL PRIMARY KEY,
    unit_name        TEXT NOT NULL DEFAULT '',
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    title            TEXT NOT NULL DEFAULT '',
    amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    method           TEXT NOT NULL DEFAULT 'نقدی',
    note             TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'ثبت‌شده',
    created_by       TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_receipts (
    id               BIGSERIAL PRIMARY KEY,
    bill_id          BIGINT,
    unit_name        TEXT NOT NULL DEFAULT '',
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    title            TEXT NOT NULL DEFAULT '',
    amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    method           TEXT NOT NULL DEFAULT '',
    note             TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'در انتظار تایید',
    created_by       TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS block_expense_invoices (
    id               BIGSERIAL PRIMARY KEY,
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    invoice_no       TEXT NOT NULL DEFAULT '',
    note             TEXT NOT NULL DEFAULT '',
    total_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0,
    created_by       TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS block_expense_items (
    id          BIGSERIAL PRIMARY KEY,
    invoice_id  BIGINT NOT NULL REFERENCES block_expense_invoices (id) ON DELETE CASCADE,
    title       TEXT NOT NULL DEFAULT '',
    amount      NUMERIC(14, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS block_expense_meta (
    id              BIGSERIAL PRIMARY KEY,
    invoice_id      BIGINT NOT NULL UNIQUE REFERENCES block_expense_invoices (id) ON DELETE CASCADE,
    expense_date    TEXT NOT NULL DEFAULT '',
    attachment_url  TEXT NOT NULL DEFAULT '',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Messaging / chat
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS panel_messages (
    id             BIGSERIAL PRIMARY KEY,
    audience_type  TEXT NOT NULL DEFAULT '',
    audience_key   TEXT NOT NULL DEFAULT '',
    tab_key        TEXT NOT NULL DEFAULT 'messages',
    title          TEXT NOT NULL DEFAULT '',
    body           TEXT NOT NULL DEFAULT '',
    is_read        BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS panel_messages_audience_idx
    ON panel_messages (audience_type, audience_key);

CREATE TABLE IF NOT EXISTS public_chat_msgs (
    id            BIGSERIAL PRIMARY KEY,
    unit_name     TEXT NOT NULL DEFAULT '',
    sender_name   TEXT NOT NULL DEFAULT '',
    message       TEXT NOT NULL DEFAULT '',
    message_type  TEXT NOT NULL DEFAULT 'text',
    audio_url     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private_chat_msgs (
    id               BIGSERIAL PRIMARY KEY,
    unit_name        TEXT NOT NULL DEFAULT '',
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    sender_type      TEXT NOT NULL DEFAULT 'resident',
    sender_name      TEXT NOT NULL DEFAULT '',
    message          TEXT NOT NULL DEFAULT '',
    message_type     TEXT NOT NULL DEFAULT 'text',
    audio_url        TEXT,
    is_read          BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_chats (
    id               BIGSERIAL PRIMARY KEY,
    block_number     TEXT NOT NULL DEFAULT '',
    block_direction  TEXT NOT NULL DEFAULT '',
    sender_role      TEXT NOT NULL DEFAULT '',
    sender_name      TEXT NOT NULL DEFAULT '',
    message          TEXT NOT NULL DEFAULT '',
    message_type     TEXT NOT NULL DEFAULT 'text',
    audio_url        TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Uploaded files (receipts, expense invoices, voice notes)
-- Stored in PostgreSQL so managers can browse them without a shared UPLOAD_DIR.
-- Rows older than 60 days are deleted automatically by the API.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Seed (idempotent)
-- Default system admin: username=admin  password=admin
-- ---------------------------------------------------------------------------

INSERT INTO admins (username, password, full_name, role)
VALUES ('admin', 'admin', 'مدیر سیستم', 'system_admin')
ON CONFLICT (username) DO NOTHING;

INSERT INTO block_managers (block_number, block_direction, full_name, password)
VALUES ('۷', 'شرقی', 'مدیر بلوک هفت شرقی', '1234')
ON CONFLICT (block_number, block_direction) DO NOTHING;
