const std = @import("std");

pub const c = @cImport({
    @cInclude("libpq-fe.h");
});

fn getenv(key: []const u8) ?[:0]const u8 {
    if (@hasDecl(std.posix, "getenv")) return std.posix.getenv(key);
    return std.os.getenv(key);
}

var mutex: std.Thread.Mutex = .{};
var conn: ?*c.PGconn = null;

fn connectUnlocked() !void {
    if (conn) |existing| {
        if (c.PQstatus(existing) == c.CONNECTION_OK) return;
        c.PQfinish(existing);
        conn = null;
    }

    const info = getenv("DATABASE_URL") orelse getenv("PG_CONNINFO") orelse
        "host=127.0.0.1 port=5432 dbname=agon user=agon password=agon";
    const pg = c.PQconnectdb(info.ptr);
    if (pg == null or c.PQstatus(pg) != c.CONNECTION_OK) {
        const msg = if (pg) |p| std.mem.span(c.PQerrorMessage(p)) else "PQconnectdb failed";
        std.log.err("postgres: {s}", .{msg});
        if (pg) |p| c.PQfinish(p);
        return error.PostgresConnect;
    }
    conn = pg;
}

pub fn connect() !void {
    mutex.lock();
    defer mutex.unlock();
    try connectUnlocked();
}

pub fn ensureSessionsTable(allocator: std.mem.Allocator) !void {
    try execOk(allocator,
        \\CREATE TABLE IF NOT EXISTS sessions (
        \\    id              BIGSERIAL PRIMARY KEY,
        \\    token           TEXT NOT NULL UNIQUE,
        \\    account_type    TEXT NOT NULL,
        \\    account_id      TEXT NOT NULL,
        \\    expires_at      TIMESTAMPTZ NOT NULL,
        \\    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        \\    revoked_at      TIMESTAMPTZ,
        \\    revoke_reason   TEXT,
        \\    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        \\)
    );
    try execOk(allocator,
        \\CREATE INDEX IF NOT EXISTS sessions_account_live_idx
        \\    ON sessions (account_type, account_id)
        \\    WHERE revoked_at IS NULL
    );
    try execOk(allocator, "CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token)");
}

fn liveUnlocked() !*c.PGconn {
    try connectUnlocked();
    return conn orelse error.PostgresConnect;
}

pub fn exec(allocator: std.mem.Allocator, sql: []const u8) ![]u8 {
    mutex.lock();
    defer mutex.unlock();
    const pg = try liveUnlocked();
    const zsql = try allocator.dupeZ(u8, sql);
    defer allocator.free(zsql);
    const res = c.PQexec(pg, zsql.ptr);
    defer c.PQclear(res);
    const status = c.PQresultStatus(res);
    if (status != c.PGRES_TUPLES_OK and status != c.PGRES_COMMAND_OK) {
        const msg = std.mem.span(c.PQerrorMessage(pg));
        std.log.err("sql error: {s}\n{s}", .{ msg, sql });
        return error.Sql;
    }
    if (status == c.PGRES_COMMAND_OK) {
        return try allocator.dupe(u8, "{}");
    }
    const rows = c.PQntuples(res);
    const cols = c.PQnfields(res);
    if (rows >= 1 and cols >= 1) {
        const val = c.PQgetvalue(res, 0, 0);
        if (val != null) {
            return try allocator.dupe(u8, std.mem.span(val));
        }
    }
    return try allocator.dupe(u8, "null");
}

pub fn execOk(allocator: std.mem.Allocator, sql: []const u8) !void {
    mutex.lock();
    defer mutex.unlock();
    const pg = try liveUnlocked();
    const zsql = try allocator.dupeZ(u8, sql);
    defer allocator.free(zsql);
    const res = c.PQexec(pg, zsql.ptr);
    defer c.PQclear(res);
    const status = c.PQresultStatus(res);
    if (status != c.PGRES_TUPLES_OK and status != c.PGRES_COMMAND_OK) {
        const msg = std.mem.span(c.PQerrorMessage(pg));
        std.log.err("sql error: {s}\n{s}", .{ msg, sql });
        return error.Sql;
    }
}

pub fn escape(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    mutex.lock();
    defer mutex.unlock();
    const pg = try liveUnlocked();
    const z = try allocator.dupeZ(u8, raw);
    defer allocator.free(z);
    const escaped = c.PQescapeLiteral(pg, z.ptr, z.len);
    if (escaped == null) return error.Escape;
    defer c.PQfreemem(escaped);
    return try allocator.dupe(u8, std.mem.span(escaped));
}

pub fn lit(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    return escape(allocator, raw);
}

pub fn jsonAgg(allocator: std.mem.Allocator, inner_sql: []const u8) ![]u8 {
    const sql = try std.fmt.allocPrint(
        allocator,
        "SELECT COALESCE(json_agg(t), '[]'::json)::text FROM ({s}) t",
        .{inner_sql},
    );
    defer allocator.free(sql);
    return exec(allocator, sql);
}

pub fn jsonRow(allocator: std.mem.Allocator, inner_sql: []const u8) ![]u8 {
    const sql = try std.fmt.allocPrint(
        allocator,
        "SELECT COALESCE(row_to_json(t), 'null'::json)::text FROM ({s}) t",
        .{inner_sql},
    );
    defer allocator.free(sql);
    return exec(allocator, sql);
}
