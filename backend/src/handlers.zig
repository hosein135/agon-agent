const std = @import("std");
const db = @import("db.zig");
const http = @import("http.zig");
const util = @import("util.zig");

pub const Ctx = struct {
    allocator: std.mem.Allocator,
    stream: std.net.Stream,
    req: http.Request,

    fn m(self: Ctx) []const u8 {
        return self.req.method;
    }
    fn q(self: Ctx, key: []const u8) []const u8 {
        return util.queryGet(self.req.query, key) orelse "";
    }
    fn send(self: Ctx, status: u16, body: []const u8) !void {
        try http.sendJson(self.stream, status, body);
    }
    fn fail(self: Ctx, status: u16, msg: []const u8) !void {
        try self.send(status, try util.errJson(self.allocator, msg));
    }
    fn json(self: Ctx) !std.json.Value {
        const raw = if (self.req.body.len == 0) "{}" else self.req.body;
        const parsed = std.json.parseFromSlice(std.json.Value, self.allocator, raw, .{}) catch {
            return error.BadJson;
        };
        return parsed.value;
    }
    fn lit(self: Ctx, s: []const u8) ![]u8 {
        return db.lit(self.allocator, s);
    }
};

const RESIDENT_COLS =
    \\r.id, r.block_number, r.block_direction, r.unit_name, r.floor, r.occupancy,
    \\r.first_name, r.last_name, r.phone, r.status, r.created_at,
    \\COALESCE(p.people_count, 1) AS people_count,
    \\COALESCE(o.is_occupant, false) AS is_occupant
;

const RESIDENT_FROM =
    \\residents r
    \\LEFT JOIN resident_people_counts p ON p.unit_name = r.unit_name
    \\LEFT JOIN resident_occupant_flags o ON o.resident_id = r.id
;

const BILL_COLS =
    \\b.*,
    \\substring(b.description from '\[\[attach:([^\]]+)\]\]') AS attachment_url,
    \\substring(b.description from '\[\[by:([^\]]*)\]\]') AS receipt_by,
    \\substring(b.description from '\[\[at:([^\]]*)\]\]') AS receipt_at,
    \\substring(b.description from '\[\[reject_reason:([\s\S]*?)\]\]') AS reject_reason,
    \\substring(b.description from '\[\[payer_id:([^\]]*)\]\]') AS payer_resident_id,
    \\substring(b.description from '\[\[payer_occ:([^\]]*)\]\]') AS payer_occupancy,
    \\substring(b.description from '\[\[payer_name:([^\]]*)\]\]') AS payer_name,
    \\(b.description ILIKE '%RECEIPT_%' OR b.description ILIKE '%[[attach:%') AS has_receipt
;

pub fn dispatch(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "OPTIONS")) {
        try http.send(ctx.stream, 204, "No Content", "text/plain", "");
        return;
    }
    const p = ctx.req.path;
    if (util.eql(p, "/api/health")) return health(ctx);
    if (util.eql(p, "/api/session")) return sessionApi(ctx);
    if (!try enforceSession(ctx)) return;
    if (util.eql(p, "/api/auth-admin")) return authAdmin(ctx);
    if (util.eql(p, "/api/auth-resident")) return authResident(ctx);
    if (util.eql(p, "/api/auth-block-manager")) return authBlockManager(ctx);
    if (util.eql(p, "/api/auth-complex-manager")) return authComplexManager(ctx);
    if (util.eql(p, "/api/auth-board")) return authBoard(ctx);
    if (util.eql(p, "/api/residents")) return residents(ctx);
    if (util.eql(p, "/api/resident-pin")) return residentPin(ctx);
    if (util.eql(p, "/api/membership-requests")) return membership(ctx);
    if (util.eql(p, "/api/complex-requests")) return complexRequests(ctx);
    if (util.eql(p, "/api/complex-managers")) return complexManagers(ctx);
    if (util.eql(p, "/api/board-members")) return boardMembers(ctx);
    if (util.eql(p, "/api/board-work-orders")) return workOrders(ctx);
    if (util.eql(p, "/api/bills")) return bills(ctx);
    if (util.eql(p, "/api/receipts")) return receipts(ctx);
    if (util.eql(p, "/api/payment-receipts")) return paymentReceipts(ctx);
    if (util.eql(p, "/api/receipt-upload")) return receiptUpload(ctx);
    if (util.eql(p, "/api/block-expenses")) return blockExpenses(ctx);
    if (util.eql(p, "/api/block-finance")) return blockFinance(ctx);
    if (util.eql(p, "/api/block-backup")) return blockBackup(ctx);
    if (util.eql(p, "/api/monthly-charge")) return monthlyCharge(ctx);
    if (util.eql(p, "/api/messages")) return messages(ctx);
    if (util.eql(p, "/api/public-chat")) return publicChat(ctx);
    if (util.eql(p, "/api/private-chat")) return privateChat(ctx);
    if (util.eql(p, "/api/staff-chat")) return staffChat(ctx);
    if (util.eql(p, "/api/units-import")) return unitsImport(ctx);
    if (util.eql(p, "/api/admin-users") or util.eql(p, "/api/profiles")) {
        try ctx.fail(404, "Not found");
        return;
    }
    if (std.mem.startsWith(u8, p, "/uploads/")) return serveUpload(ctx);
    try ctx.fail(404, "API not found");
}

fn health(ctx: Ctx) !void {
    const body =
        \\{"ok":true,"service":"agon-zig","node":"zig"}
    ;
    try ctx.send(200, body);
}

fn pinOk(allocator: std.mem.Allocator, a: []const u8, b: []const u8) !bool {
    const x = try util.toEnglishDigits(allocator, util.trim(a));
    const y = try util.toEnglishDigits(allocator, util.trim(b));
    return util.eql(x, y);
}

const IssuedSession = struct {
    token: []const u8,
    expires_at: []const u8,
};

fn bearerToken(auth_header: []const u8) []const u8 {
    const t = util.trim(auth_header);
    if (t.len >= 7 and std.ascii.eqlIgnoreCase(t[0..7], "bearer ")) {
        return util.trim(t[7..]);
    }
    return t;
}

fn isLoginPost(ctx: Ctx) bool {
    if (!util.eql(ctx.m(), "POST")) return false;
    const p = ctx.req.path;
    return util.eql(p, "/api/auth-admin") or
        util.eql(p, "/api/auth-resident") or
        util.eql(p, "/api/auth-block-manager") or
        util.eql(p, "/api/auth-complex-manager") or
        util.eql(p, "/api/auth-board");
}

fn failCode(ctx: Ctx, status: u16, msg: []const u8, code: []const u8) !void {
    const body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"error\":{s},\"code\":{s}}}",
        .{ try jsonEncode(ctx.allocator, msg), try jsonEncode(ctx.allocator, code) },
    );
    try ctx.send(status, body);
}

fn issueSession(ctx: Ctx, account_type: []const u8, account_id: []const u8) !IssuedSession {
    const type_lit = try ctx.lit(account_type);
    const id_lit = try ctx.lit(account_id);
    try db.execOk(ctx.allocator, try std.fmt.allocPrint(
        ctx.allocator,
        "UPDATE sessions SET revoked_at = now(), revoke_reason = 'replaced' WHERE account_type = {s} AND account_id = {s} AND revoked_at IS NULL",
        .{ type_lit, id_lit },
    ));
    const row = try db.exec(ctx.allocator, try std.fmt.allocPrint(
        ctx.allocator,
        \\WITH ins AS (
        \\  INSERT INTO sessions (token, account_type, account_id, expires_at, last_seen_at)
        \\  VALUES (encode(gen_random_bytes(32), 'hex'), {s}, {s}, now() + interval '12 hours', now())
        \\  RETURNING token, to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS expires_at
        \\)
        \\SELECT COALESCE(row_to_json(t), 'null'::json)::text FROM ins t
    ,
        .{ type_lit, id_lit },
    ));
    if (util.eql(row, "null")) return error.Sql;
    const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
    return .{
        .token = try util.jsonStrAlloc(ctx.allocator, parsed.value, "token"),
        .expires_at = try util.jsonStrAlloc(ctx.allocator, parsed.value, "expires_at"),
    };
}

fn sendAuthOk(ctx: Ctx, account_type: []const u8, account_id: []const u8, payload_key: []const u8, payload_json: []const u8) !void {
    const sess = issueSession(ctx, account_type, account_id) catch {
        return ctx.fail(500, "ساخت نشست ناموفق بود");
    };
    const out = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"token\":{s},\"expires_at\":{s},\"{s}\":{s}}}",
        .{
            try jsonEncode(ctx.allocator, sess.token),
            try jsonEncode(ctx.allocator, sess.expires_at),
            payload_key,
            payload_json,
        },
    );
    return ctx.send(200, out);
}

fn lookupSessionRow(ctx: Ctx, token: []const u8) ![]u8 {
    return db.jsonRow(ctx.allocator, try std.fmt.allocPrint(
        ctx.allocator,
        \\SELECT token, account_type, account_id, revoke_reason,
        \\       (revoked_at IS NOT NULL) AS revoked,
        \\       (expires_at < now()) AS abs_expired,
        \\       (last_seen_at < now() - interval '30 minutes') AS idle_expired
        \\FROM sessions WHERE token = {s}
    ,
        .{try ctx.lit(token)},
    ));
}

fn touchSession(ctx: Ctx, token: []const u8) !void {
    try db.execOk(ctx.allocator, try std.fmt.allocPrint(
        ctx.allocator,
        "UPDATE sessions SET last_seen_at = now() WHERE token = {s} AND revoked_at IS NULL",
        .{try ctx.lit(token)},
    ));
}

fn revokeSession(ctx: Ctx, token: []const u8, reason: []const u8) !void {
    try db.execOk(ctx.allocator, try std.fmt.allocPrint(
        ctx.allocator,
        "UPDATE sessions SET revoked_at = now(), revoke_reason = {s} WHERE token = {s} AND revoked_at IS NULL",
        .{ try ctx.lit(reason), try ctx.lit(token) },
    ));
}

fn sessionStatus(ctx: Ctx, token: []const u8, touch: bool) ![]const u8 {
    if (token.len == 0) return "missing";
    const row = lookupSessionRow(ctx, token) catch return "expired";
    if (util.eql(row, "null")) return "expired";
    const parsed = std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{}) catch return "expired";
    const revoked = util.jsonBool(parsed.value, "revoked") orelse false;
    const abs_expired = util.jsonBool(parsed.value, "abs_expired") orelse false;
    const idle_expired = util.jsonBool(parsed.value, "idle_expired") orelse false;
    if (revoked) {
        const reason = util.jsonStr(parsed.value, "revoke_reason");
        if (util.eql(reason, "replaced")) return "replaced";
        if (util.eql(reason, "timeout")) return "expired";
        return "revoked";
    }
    if (abs_expired or idle_expired) {
        revokeSession(ctx, token, "timeout") catch {};
        return "expired";
    }
    if (touch) touchSession(ctx, token) catch {};
    return "ok";
}

fn rejectSession(ctx: Ctx, status_code: []const u8) !void {
    if (util.eql(status_code, "replaced")) {
        return failCode(ctx, 401, "این حساب از دستگاه دیگری وارد شده است", "session_replaced");
    }
    if (util.eql(status_code, "revoked")) {
        return failCode(ctx, 401, "نشست شما پایان یافته است", "session_revoked");
    }
    return failCode(ctx, 401, "نشست شما منقضی شده است", "session_expired");
}

fn enforceSession(ctx: Ctx) !bool {
    if (isLoginPost(ctx)) return true;
    const token = bearerToken(ctx.req.authorization);
    if (token.len == 0) return true;
    const st = try sessionStatus(ctx, token, true);
    if (util.eql(st, "ok")) return true;
    try rejectSession(ctx, st);
    return false;
}

fn sessionApi(ctx: Ctx) !void {
    const token = bearerToken(ctx.req.authorization);
    if (util.eql(ctx.m(), "GET") or util.eql(ctx.m(), "POST")) {
        const touch = util.eql(ctx.m(), "POST");
        const st = try sessionStatus(ctx, token, touch);
        if (!util.eql(st, "ok")) return rejectSession(ctx, st);
        return ctx.send(200, "{\"ok\":true}");
    }
    if (util.eql(ctx.m(), "DELETE")) {
        if (token.len > 0) revokeSession(ctx, token, "logout") catch {};
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn authAdmin(ctx: Ctx) !void {
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const username = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "username"));
        const password = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "password"));
        const role = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "role"));
        if (username.len == 0) return ctx.fail(400, "نام کاربری الزامی است");
        if (password.len < 4) return ctx.fail(400, "رمز حداقل ۴ کاراکتر باشد");
        const u = try ctx.lit(username);
        var sql_buf = std.ArrayList(u8).init(ctx.allocator);
        try sql_buf.writer().print(
            "SELECT id, username, password, full_name, role, created_at FROM admins WHERE username = {s}",
            .{u},
        );
        if (role.len > 0) {
            const r = try ctx.lit(role);
            try sql_buf.writer().print(" AND role = {s}", .{r});
        }
        const row = try db.jsonRow(ctx.allocator, sql_buf.items);
        if (util.eql(row, "null")) return ctx.fail(401, "نام کاربری یا رمز نادرست است");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        const stored = util.jsonStr(parsed.value, "password");
        if (!try pinOk(ctx.allocator, stored, password)) return ctx.fail(401, "نام کاربری یا رمز نادرست است");
        const id = util.jsonStrAlloc(ctx.allocator, parsed.value, "id") catch "0";
        return sendAuthOk(ctx, "admin", id, "admin", try stripPassword(ctx.allocator, row));
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try util.jsonStrAlloc(ctx.allocator, body, "id");
        const username = try util.jsonStrAlloc(ctx.allocator, body, "username");
        const current = try util.jsonStrAlloc(ctx.allocator, body, "current_password");
        const next = try util.jsonStrAlloc(ctx.allocator, body, "new_password");
        const confirm = try util.jsonStrAlloc(ctx.allocator, body, "confirm_password");
        if (next.len < 4) return ctx.fail(400, "رمز جدید حداقل ۴ کاراکتر باشد");
        if (!util.eql(next, confirm)) return ctx.fail(400, "رمز جدید و تکرار آن یکسان نیست");
        var sql_buf = std.ArrayList(u8).init(ctx.allocator);
        try sql_buf.appendSlice("SELECT * FROM admins WHERE ");
        if (id.len > 0) {
            try sql_buf.writer().print("id = {d}", .{try parseId(id)});
        } else if (username.len > 0) {
            try sql_buf.writer().print("username = {s}", .{try ctx.lit(username)});
        } else return ctx.fail(400, "شناسه یا نام کاربری الزامی است");
        const row = try db.jsonRow(ctx.allocator, sql_buf.items);
        if (util.eql(row, "null")) return ctx.fail(404, "مدیر یافت نشد");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        if (!try pinOk(ctx.allocator, util.jsonStr(parsed.value, "password"), current)) {
            return ctx.fail(401, "رمز فعلی نادرست است");
        }
        const rid = try parseId(try util.jsonStrAlloc(ctx.allocator, parsed.value, "id"));
        const np = try ctx.lit(try util.toEnglishDigits(ctx.allocator, next));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE admins SET password = {s} WHERE id = {d}", .{ np, rid }));
        const updated = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id, username, full_name, role, created_at FROM admins WHERE id = {d}", .{rid}));
        const out = try std.fmt.allocPrint(ctx.allocator, "{{\"ok\":true,\"message\":\"رمز با موفقیت تغییر کرد\",\"admin\":{s}}}", .{updated});
        return ctx.send(200, out);
    }
    return ctx.fail(405, "Method not allowed");
}

fn authResident(ctx: Ctx) !void {
    if (!util.eql(ctx.m(), "POST")) return ctx.fail(405, "Method not allowed");
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "unit_name"));
    const pin = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "pin"));
    if (unit.len == 0) return ctx.fail(400, "نام واحد را انتخاب کنید");
    const pin_en = try util.toEnglishDigits(ctx.allocator, pin);
    if (pin_en.len < 4) return ctx.fail(400, "رمز باید حداقل ۴ کاراکتر باشد");
    const u = try ctx.lit(unit);
    const inner = try std.fmt.allocPrint(ctx.allocator,
        "SELECT {s} FROM {s} WHERE r.unit_name = {s} LIMIT 1",
        .{ RESIDENT_COLS, RESIDENT_FROM, u },
    );
    var row = try db.jsonRow(ctx.allocator, inner);
    if (util.eql(row, "null")) {
        const en = try util.toEnglishDigits(ctx.allocator, unit);
        if (!util.eql(en, unit)) {
            const unit_en_lit = try ctx.lit(en);
            row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM {s} WHERE r.unit_name = {s} LIMIT 1", .{ RESIDENT_COLS, RESIDENT_FROM, unit_en_lit }));
        }
    }
    if (util.eql(row, "null")) return ctx.fail(401, "نام واحد یا رمز عبور نادرست است");
    const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
    const stored_pin = try db.exec(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT pin FROM residents WHERE id = {d}", .{try parseId(try util.jsonStrAlloc(ctx.allocator, parsed.value, "id"))}));
    const stored = std.mem.trim(u8, stored_pin, " \"");
    if (!try pinOk(ctx.allocator, stored, pin)) return ctx.fail(401, "نام واحد یا رمز عبور نادرست است");
    if (util.eql(util.jsonStr(parsed.value, "status"), "blocked")) return ctx.fail(403, "حساب شما مسدود شده است");
    const id = try util.jsonStrAlloc(ctx.allocator, parsed.value, "id");
    return sendAuthOk(ctx, "resident", id, "user", row);
}

fn authBlockManager(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        const json = try db.jsonAgg(ctx.allocator, "SELECT id, block_number, block_direction, full_name, created_at FROM block_managers ORDER BY block_number");
        return ctx.send(200, json);
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const bn = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_number"));
        const bd = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_direction"));
        const password = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "password"));
        if (bn.len == 0) return ctx.fail(400, "شماره بلوک را انتخاب کنید");
        if (!(util.eql(bd, "شرقی") or util.eql(bd, "غربی"))) return ctx.fail(400, "جهت بلوک را انتخاب کنید");
        if (password.len == 0) return ctx.fail(400, "رمز عبور الزامی است");
        const rows = try db.jsonAgg(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM block_managers WHERE block_direction = {s}", .{try ctx.lit(bd)}));
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, rows, .{});
        const arr = switch (parsed.value) {
            .array => |a| a,
            else => return ctx.fail(401, "بلوک، جهت یا رمز عبور نادرست است"),
        };
        const bn_en = try util.toEnglishDigits(ctx.allocator, bn);
        var found: ?std.json.Value = null;
        for (arr.items) |row| {
            const rbn = try util.toEnglishDigits(ctx.allocator, util.jsonStr(row, "block_number"));
            if (util.eql(rbn, bn_en) and try pinOk(ctx.allocator, util.jsonStr(row, "password"), password)) {
                found = row;
                break;
            }
        }
        const row = found orelse return ctx.fail(401, "بلوک، جهت یا رمز عبور نادرست است");
        const id = try util.jsonStrAlloc(ctx.allocator, row, "id");
        const full = util.jsonStr(row, "full_name");
        const admin_json = try std.fmt.allocPrint(ctx.allocator,
            "{{\"id\":{s},\"full_name\":{s},\"block_number\":{s},\"block_direction\":{s},\"role\":\"block_manager\"}}",
            .{
                try jsonEncode(ctx.allocator, id),
                try jsonEncode(ctx.allocator, full),
                try jsonEncode(ctx.allocator, util.jsonStr(row, "block_number")),
                try jsonEncode(ctx.allocator, bd),
            },
        );
        return sendAuthOk(ctx, "block_manager", id, "admin", admin_json);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try util.jsonStrAlloc(ctx.allocator, body, "id");
        const current = try util.jsonStrAlloc(ctx.allocator, body, "current_password");
        const next = try util.jsonStrAlloc(ctx.allocator, body, "new_password");
        const confirm = try util.jsonStrAlloc(ctx.allocator, body, "confirm_password");
        if (next.len < 4) return ctx.fail(400, "رمز جدید حداقل ۴ کاراکتر باشد");
        if (!util.eql(next, confirm)) return ctx.fail(400, "رمز جدید و تکرار آن یکسان نیست");
        const rid = try parseId(id);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM block_managers WHERE id = {d}", .{rid}));
        if (util.eql(row, "null")) return ctx.fail(404, "مدیر یافت نشد");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        if (!try pinOk(ctx.allocator, util.jsonStr(parsed.value, "password"), current)) return ctx.fail(401, "رمز فعلی نادرست است");
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE block_managers SET password = {s} WHERE id = {d}", .{ try ctx.lit(try util.toEnglishDigits(ctx.allocator, next)), rid }));
        return ctx.send(200, try util.okMsg(ctx.allocator, "رمز با موفقیت تغییر کرد"));
    }
    return ctx.fail(405, "Method not allowed");
}

fn authComplexManager(ctx: Ctx) !void {
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "complex_name"));
        const password = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "password"));
        if (name.len == 0) return ctx.fail(400, "نام مجتمع الزامی است");
        if (password.len < 4) return ctx.fail(400, "رمز حداقل ۴ کاراکتر باشد");
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM complex_managers WHERE complex_name = {s}", .{try ctx.lit(name)}));
        if (util.eql(row, "null")) return ctx.fail(401, "نام مجتمع یا رمز نادرست است");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        if (!try pinOk(ctx.allocator, util.jsonStr(parsed.value, "password"), password)) return ctx.fail(401, "نام مجتمع یا رمز نادرست است");
        const id = try util.jsonStrAlloc(ctx.allocator, parsed.value, "id");
        return sendAuthOk(ctx, "complex_manager", id, "admin", try stripPassword(ctx.allocator, row));
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try util.jsonStrAlloc(ctx.allocator, body, "id");
        const name = try util.jsonStrAlloc(ctx.allocator, body, "complex_name");
        const current = try util.jsonStrAlloc(ctx.allocator, body, "current_password");
        const next = try util.jsonStrAlloc(ctx.allocator, body, "new_password");
        const confirm = try util.jsonStrAlloc(ctx.allocator, body, "confirm_password");
        if (next.len < 4) return ctx.fail(400, "رمز جدید حداقل ۴ کاراکتر باشد");
        if (!util.eql(next, confirm)) return ctx.fail(400, "رمز جدید و تکرار آن یکسان نیست");
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice("SELECT * FROM complex_managers WHERE ");
        if (id.len > 0) try sql.writer().print("id = {d}", .{try parseId(id)}) else if (name.len > 0) try sql.writer().print("complex_name = {s}", .{try ctx.lit(name)}) else return ctx.fail(400, "شناسه یا نام مجتمع الزامی است");
        const row = try db.jsonRow(ctx.allocator, sql.items);
        if (util.eql(row, "null")) return ctx.fail(404, "مدیر مجتمع یافت نشد");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        if (!try pinOk(ctx.allocator, util.jsonStr(parsed.value, "password"), current)) return ctx.fail(401, "رمز فعلی نادرست است");
        const rid = try parseId(try util.jsonStrAlloc(ctx.allocator, parsed.value, "id"));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE complex_managers SET password = {s} WHERE id = {d}", .{ try ctx.lit(try util.toEnglishDigits(ctx.allocator, next)), rid }));
        const updated = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id, complex_name, blocks_count, units_count, address, full_name, created_at FROM complex_managers WHERE id = {d}", .{rid}));
        const out = try std.fmt.allocPrint(ctx.allocator, "{{\"ok\":true,\"message\":\"رمز با موفقیت تغییر کرد\",\"admin\":{s}}}", .{updated});
        return ctx.send(200, out);
    }
    return ctx.fail(405, "Method not allowed");
}

fn authBoard(ctx: Ctx) !void {
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const complex_name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "complex_name"));
        const password = try util.toEnglishDigits(ctx.allocator, util.trim(try util.jsonStrAlloc(ctx.allocator, body, "password")));
        const phone = try util.onlyDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "phone"));
        const full_name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "full_name"));
        if (password.len < 4) return ctx.fail(400, "رمز حداقل ۴ کاراکتر باشد");
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice("SELECT * FROM board_members WHERE status = 'active'");
        if (complex_name.len > 0) try sql.writer().print(" AND complex_name = {s}", .{try ctx.lit(complex_name)});
        const rows = try db.jsonAgg(ctx.allocator, sql.items);
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, rows, .{});
        const arr = switch (parsed.value) {
            .array => |a| a,
            else => return ctx.fail(401, "اطلاعات ورود هیئت مدیره نادرست است"),
        };
        var found: ?std.json.Value = null;
        for (arr.items) |row| {
            if (!try pinOk(ctx.allocator, util.jsonStr(row, "password"), password)) continue;
            const rphone = try util.onlyDigits(ctx.allocator, util.jsonStr(row, "phone"));
            if (phone.len > 0 and util.eql(rphone, phone)) {
                found = row;
                break;
            }
            if (full_name.len > 0 and util.eql(util.trim(util.jsonStr(row, "full_name")), full_name)) {
                found = row;
                break;
            }
        }
        const row = found orelse return ctx.fail(401, "اطلاعات ورود هیئت مدیره نادرست است");
        const id = try util.jsonStrAlloc(ctx.allocator, row, "id");
        const safe = try stripPassword(ctx.allocator, try std.json.stringifyAlloc(ctx.allocator, row, .{}));
        return sendAuthOk(ctx, "board", id, "admin", safe);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try util.jsonStrAlloc(ctx.allocator, body, "id");
        if (id.len == 0) return ctx.fail(400, "شناسه الزامی است");
        const current = try util.jsonStrAlloc(ctx.allocator, body, "current_password");
        const next = try util.jsonStrAlloc(ctx.allocator, body, "new_password");
        const confirm = try util.jsonStrAlloc(ctx.allocator, body, "confirm_password");
        if (next.len < 4) return ctx.fail(400, "رمز جدید حداقل ۴ کاراکتر باشد");
        if (!util.eql(next, confirm)) return ctx.fail(400, "رمز جدید و تکرار آن یکسان نیست");
        const rid = try parseId(id);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM board_members WHERE id = {d}", .{rid}));
        if (util.eql(row, "null")) return ctx.fail(404, "عضو یافت نشد");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        if (!try pinOk(ctx.allocator, util.jsonStr(parsed.value, "password"), current)) return ctx.fail(401, "رمز فعلی نادرست است");
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE board_members SET password = {s}, updated_at = now() WHERE id = {d}", .{ try ctx.lit(try util.toEnglishDigits(ctx.allocator, next)), rid }));
        return ctx.send(200, try util.okMsg(ctx.allocator, "رمز با موفقیت تغییر کرد"));
    }
    return ctx.fail(405, "Method not allowed");
}

fn residents(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        const units = ctx.q("units");
        const inner = if (util.eql(units, "1") or util.eql(units, "true"))
            try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM {s} WHERE r.status = 'active' ORDER BY r.unit_name", .{ RESIDENT_COLS, RESIDENT_FROM })
        else
            try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM {s} ORDER BY r.created_at DESC", .{ RESIDENT_COLS, RESIDENT_FROM });
        return ctx.send(200, try db.jsonAgg(ctx.allocator, inner));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const bn = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_number"));
        const bd = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_direction"));
        const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "unit_name"));
        const floor = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "floor"));
        const occ = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "occupancy"));
        const fn_ = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "first_name"));
        const ln = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "last_name"));
        const phone = try util.onlyDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "phone"));
        const pin = try util.toEnglishDigits(ctx.allocator, util.trim(try util.jsonStrAlloc(ctx.allocator, body, "pin")));
        const people = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "people_count"));
        if (bn.len == 0) return ctx.fail(400, "شماره بلوک الزامی است");
        if (!(util.eql(bd, "شرقی") or util.eql(bd, "غربی"))) return ctx.fail(400, "جهت بلوک را انتخاب کنید");
        if (unit.len == 0) return ctx.fail(400, "نام واحد الزامی است");
        if (floor.len == 0) return ctx.fail(400, "طبقه الزامی است");
        if (!(util.eql(occ, "مالک") or util.eql(occ, "مستاجر"))) return ctx.fail(400, "مالک یا مستاجر را انتخاب کنید");
        if (fn_.len == 0) return ctx.fail(400, "نام الزامی است");
        if (ln.len == 0) return ctx.fail(400, "نام خانوادگی الزامی است");
        if (phone.len == 0) return ctx.fail(400, "شماره تماس الزامی است");
        if (pin.len < 4) return ctx.fail(400, "رمز باید حداقل ۴ کاراکتر باشد");
        const dup = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id FROM residents WHERE unit_name = {s} AND occupancy = {s} LIMIT 1", .{ try ctx.lit(unit), try ctx.lit(occ) }));
        if (!util.eql(dup, "null")) return ctx.fail(400, "برای این واحد قبلاً همین نقش ثبت شده است");
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO residents (block_number, block_direction, unit_name, floor, occupancy, first_name, last_name, phone, pin, status) VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{s},'active') RETURNING id",
            .{ try ctx.lit(bn), try ctx.lit(bd), try ctx.lit(unit), try ctx.lit(floor), try ctx.lit(occ), try ctx.lit(fn_), try ctx.lit(ln), try ctx.lit(phone), try ctx.lit(pin) },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const rid = try parseId(std.mem.trim(u8, idj, " \n\""));
        const pc = if (people.len == 0) "1" else people;
        try upsertPeople(ctx, unit, pc, bn, bd, rid);
        try upsertOccupant(ctx, rid, unit, bn, bd, true);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM {s} WHERE r.id = {d}", .{ RESIDENT_COLS, RESIDENT_FROM, rid }));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try util.jsonStrAlloc(ctx.allocator, body, "id");
        if (id.len == 0) return ctx.fail(400, "شناسه الزامی است");
        const rid = try parseId(id);
        const existing = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM residents WHERE id = {d}", .{rid}));
        if (util.eql(existing, "null")) return ctx.fail(404, "ساکن یافت نشد");
        if (util.jsonBool(body, "is_occupant") != null and !util.jsonHas(body, "first_name")) {
            const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, existing, .{});
            try upsertOccupant(ctx, rid, util.jsonStr(parsed.value, "unit_name"), util.jsonStr(parsed.value, "block_number"), util.jsonStr(parsed.value, "block_direction"), util.jsonBool(body, "is_occupant").?);
            const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM {s} WHERE r.id = {d}", .{ RESIDENT_COLS, RESIDENT_FROM, rid }));
            return ctx.send(200, row);
        }
        var sets = std.ArrayList(u8).init(ctx.allocator);
        try addSet(&sets, ctx, body, "block_number");
        try addSet(&sets, ctx, body, "block_direction");
        try addSet(&sets, ctx, body, "unit_name");
        try addSet(&sets, ctx, body, "floor");
        try addSet(&sets, ctx, body, "occupancy");
        try addSet(&sets, ctx, body, "first_name");
        try addSet(&sets, ctx, body, "last_name");
        try addSet(&sets, ctx, body, "phone");
        try addSet(&sets, ctx, body, "status");
        if (util.jsonHas(body, "pin")) {
            const pin = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "pin"));
            if (sets.items.len > 0) try sets.appendSlice(", ");
            try sets.writer().print("pin = {s}", .{try ctx.lit(pin)});
        }
        if (sets.items.len > 0) {
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE residents SET {s} WHERE id = {d}", .{ sets.items, rid }));
        }
        if (util.jsonHas(body, "people_count")) {
            const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, existing, .{});
            const unit = blk: {
                const u = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "unit_name"));
                break :blk if (u.len > 0) u else util.jsonStr(parsed.value, "unit_name");
            };
            try upsertPeople(ctx, unit, try util.jsonStrAlloc(ctx.allocator, body, "people_count"), util.jsonStr(parsed.value, "block_number"), util.jsonStr(parsed.value, "block_direction"), rid);
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM {s} WHERE r.id = {d}", .{ RESIDENT_COLS, RESIDENT_FROM, rid }));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        const id = ctx.q("id");
        const body_id = if (id.len > 0) id else blk: {
            const b = ctx.json() catch return ctx.fail(400, "شناسه الزامی است");
            break :blk try util.jsonStrAlloc(ctx.allocator, b, "id");
        };
        if (body_id.len == 0) return ctx.fail(400, "شناسه الزامی است");
        const rid = try parseId(body_id);
        const existing = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT unit_name FROM residents WHERE id = {d}", .{rid}));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM resident_occupant_flags WHERE resident_id = {d}", .{rid}));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM residents WHERE id = {d}", .{rid}));
        if (!util.eql(existing, "null")) {
            const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, existing, .{});
            const unit = util.jsonStr(parsed.value, "unit_name");
            const left = try db.exec(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT count(*)::text FROM residents WHERE unit_name = {s}", .{try ctx.lit(unit)}));
            if (util.eql(std.mem.trim(u8, left, " \""), "0")) {
                try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM resident_people_counts WHERE unit_name = {s}", .{try ctx.lit(unit)}));
            }
        }
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn residentPin(ctx: Ctx) !void {
    if (!util.eql(ctx.m(), "POST")) return ctx.fail(405, "Method not allowed");
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    const action = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "action"));
    const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "unit_name"));
    if (unit.len == 0) return ctx.fail(400, "نام واحد الزامی است");
    if (util.eql(action, "change")) {
        const current = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "current_pin"));
        const next = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "new_pin"));
        const confirm = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "confirm_pin"));
        if (next.len < 4) return ctx.fail(400, "رمز باید حداقل ۴ کاراکتر باشد");
        if (!util.eql(next, confirm)) return ctx.fail(400, "رمز جدید و تکرار آن یکسان نیست");
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id, pin, status FROM residents WHERE unit_name = {s}", .{try ctx.lit(unit)}));
        if (util.eql(row, "null")) return ctx.fail(404, "ساکن یافت نشد");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        if (util.eql(util.jsonStr(parsed.value, "status"), "blocked")) return ctx.fail(403, "حساب مسدود است");
        if (!try pinOk(ctx.allocator, util.jsonStr(parsed.value, "pin"), current)) return ctx.fail(401, "رمز فعلی نادرست است");
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE residents SET pin = {s} WHERE id = {d}", .{ try ctx.lit(next), try parseId(try util.jsonStrAlloc(ctx.allocator, parsed.value, "id")) }));
        return ctx.send(200, try util.okMsg(ctx.allocator, "رمز با موفقیت تغییر کرد"));
    }
    if (util.eql(action, "forgot")) {
        const first_name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "first_name"));
        const last_name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "last_name"));
        const phone = try util.onlyDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "phone"));
        const next = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "new_pin"));
        const confirm = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "confirm_pin"));
        if (next.len < 4) return ctx.fail(400, "رمز باید حداقل ۴ کاراکتر باشد");
        if (!util.eql(next, confirm)) return ctx.fail(400, "رمز جدید و تکرار آن یکسان نیست");
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM residents WHERE unit_name = {s}", .{try ctx.lit(unit)}));
        if (util.eql(row, "null")) return ctx.fail(404, "اطلاعات ساکن یافت نشد");
        const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, row, .{});
        if (util.eql(util.jsonStr(parsed.value, "status"), "blocked")) return ctx.fail(403, "حساب شما مسدود است");
        const rphone = try util.onlyDigits(ctx.allocator, util.jsonStr(parsed.value, "phone"));
        if (!util.eql(util.trim(util.jsonStr(parsed.value, "first_name")), first_name) or
            !util.eql(util.trim(util.jsonStr(parsed.value, "last_name")), last_name) or
            !util.eql(rphone, phone))
        {
            return ctx.fail(401, "اطلاعات هویتی با مشخصات ثبت‌شده مطابقت ندارد");
        }
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE residents SET pin = {s} WHERE id = {d}", .{ try ctx.lit(next), try parseId(try util.jsonStrAlloc(ctx.allocator, parsed.value, "id")) }));
        return ctx.send(200, try util.okMsg(ctx.allocator, "رمز جدید ثبت شد. اکنون می‌توانید وارد شوید."));
    }
    return ctx.fail(400, "عملیات نامعتبر است");
}

fn membership(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice(
            \\SELECT m.id, m.block_number, m.block_direction, m.unit_name, m.floor, m.occupancy,
            \\m.first_name, m.last_name, m.phone, m.status, m.created_at, m.reviewed_at,
            \\COALESCE(p.people_count, 1) AS people_count
            \\FROM membership_requests m
            \\LEFT JOIN resident_people_counts p ON p.unit_name = m.unit_name
            \\WHERE 1=1
        );
        if (ctx.q("block_number").len > 0) try sql.writer().print(" AND m.block_number = {s}", .{try ctx.lit(ctx.q("block_number"))});
        if (ctx.q("block_direction").len > 0) try sql.writer().print(" AND m.block_direction = {s}", .{try ctx.lit(ctx.q("block_direction"))});
        if (ctx.q("status").len > 0) try sql.writer().print(" AND m.status = {s}", .{try ctx.lit(ctx.q("status"))});
        try sql.appendSlice(" ORDER BY m.created_at DESC");
        return ctx.send(200, try db.jsonAgg(ctx.allocator, sql.items));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const bn = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_number"));
        const bd = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_direction"));
        const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "unit_name"));
        const floor = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "floor"));
        const occ = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "occupancy"));
        const fn_ = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "first_name"));
        const ln = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "last_name"));
        const phone = try util.onlyDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "phone"));
        const pin = try util.toEnglishDigits(ctx.allocator, util.trim(try util.jsonStrAlloc(ctx.allocator, body, "pin")));
        if (bn.len == 0 or unit.len == 0 or fn_.len == 0 or ln.len == 0 or pin.len < 4) return ctx.fail(400, "فیلدهای الزامی ناقص است");
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO membership_requests (block_number, block_direction, unit_name, floor, occupancy, first_name, last_name, phone, pin, status) VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{s},'دریافت شده') RETURNING id",
            .{ try ctx.lit(bn), try ctx.lit(bd), try ctx.lit(unit), try ctx.lit(floor), try ctx.lit(occ), try ctx.lit(fn_), try ctx.lit(ln), try ctx.lit(phone), try ctx.lit(pin) },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const mid = try parseId(std.mem.trim(u8, idj, " \n\""));
        try upsertPeople(ctx, unit, try util.jsonStrAlloc(ctx.allocator, body, "people_count"), bn, bd, 0);
        try notify(ctx, "block_manager", try std.fmt.allocPrint(ctx.allocator, "{s}|{s}", .{ bn, bd }), "membership", "درخواست عضویت جدید", unit);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id, block_number, block_direction, unit_name, floor, occupancy, first_name, last_name, phone, status, created_at FROM membership_requests WHERE id = {d}", .{mid}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try util.jsonStrAlloc(ctx.allocator, body, "id");
        const status = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "status"));
        if (id.len == 0) return ctx.fail(400, "شناسه الزامی است");
        const rid = try parseId(id);
        const current = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM membership_requests WHERE id = {d}", .{rid}));
        if (util.eql(current, "null")) return ctx.fail(404, "درخواست یافت نشد");
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE membership_requests SET status = {s}, reviewed_at = now() WHERE id = {d}", .{ try ctx.lit(status), rid }));
        if (util.eql(status, "تایید شده")) {
            const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, current, .{});
            const unit = util.jsonStr(parsed.value, "unit_name");
            const occ = util.jsonStr(parsed.value, "occupancy");
            const exists = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id FROM residents WHERE unit_name = {s} AND occupancy = {s} LIMIT 1", .{ try ctx.lit(unit), try ctx.lit(occ) }));
            if (util.eql(exists, "null")) {
                try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator,
                    "INSERT INTO residents (block_number, block_direction, unit_name, floor, occupancy, first_name, last_name, phone, pin, status) SELECT block_number, block_direction, unit_name, floor, occupancy, first_name, last_name, phone, pin, 'active' FROM membership_requests WHERE id = {d}",
                    .{rid},
                ));
            }
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id, block_number, block_direction, unit_name, floor, occupancy, first_name, last_name, phone, status, created_at, reviewed_at FROM membership_requests WHERE id = {d}", .{rid}));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        const body_id = blk: {
            const qid = ctx.q("id");
            if (qid.len > 0) break :blk qid;
            break :blk try util.jsonStrAlloc(ctx.allocator, body, "id");
        };
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM membership_requests WHERE id = {d}", .{try parseId(body_id)}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn complexRequests(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        return ctx.send(200, try db.jsonAgg(ctx.allocator, "SELECT id, complex_name, blocks_count, units_count, address, first_name, last_name, national_id, phone, status, created_at, reviewed_at FROM complex_manager_requests ORDER BY created_at DESC"));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "complex_name"));
        if (name.len == 0) return ctx.fail(400, "نام مجتمع الزامی است");
        const exists = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id FROM complex_managers WHERE complex_name = {s}", .{try ctx.lit(name)}));
        if (!util.eql(exists, "null")) return ctx.fail(400, "این مجتمع قبلاً تایید و ثبت شده است");
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO complex_manager_requests (complex_name, blocks_count, units_count, address, password, first_name, last_name, national_id, phone, status) VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{s},'دریافت شده') RETURNING id",
            .{
                try ctx.lit(name),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "blocks_count")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "units_count")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "address")),
                try ctx.lit(try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "password"))),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "first_name")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "last_name")),
                try ctx.lit(try util.onlyDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "national_id"))),
                try ctx.lit(try util.onlyDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "phone"))),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        try notify(ctx, "system_admin", "all", "complex_requests", "درخواست مدیر مجتمع", name);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id, complex_name, blocks_count, units_count, address, first_name, last_name, national_id, phone, status, created_at FROM complex_manager_requests WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        const status = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "status"));
        const current = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM complex_manager_requests WHERE id = {d}", .{id}));
        if (util.eql(current, "null")) return ctx.fail(404, "درخواست یافت نشد");
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE complex_manager_requests SET status = {s}, reviewed_at = now() WHERE id = {d}", .{ try ctx.lit(status), id }));
        if (util.eql(status, "تایید شده")) {
            const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, current, .{});
            const name = util.jsonStr(parsed.value, "complex_name");
            const exists = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id FROM complex_managers WHERE complex_name = {s}", .{try ctx.lit(name)}));
            if (util.eql(exists, "null")) {
                const full = try std.fmt.allocPrint(ctx.allocator, "{s} {s}", .{ util.jsonStr(parsed.value, "first_name"), util.jsonStr(parsed.value, "last_name") });
                try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator,
                    "INSERT INTO complex_managers (complex_name, blocks_count, units_count, address, password, full_name) VALUES ({s},{s},{s},{s},{s},{s})",
                    .{ try ctx.lit(name), try ctx.lit(util.jsonStr(parsed.value, "blocks_count")), try ctx.lit(util.jsonStr(parsed.value, "units_count")), try ctx.lit(util.jsonStr(parsed.value, "address")), try ctx.lit(util.jsonStr(parsed.value, "password")), try ctx.lit(full) },
                ));
            }
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id, complex_name, blocks_count, units_count, address, first_name, last_name, national_id, phone, status, created_at, reviewed_at FROM complex_manager_requests WHERE id = {d}", .{id}));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM complex_manager_requests WHERE id = {d}", .{id}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn complexManagers(ctx: Ctx) !void {
    if (!util.eql(ctx.m(), "GET")) return ctx.fail(405, "Method not allowed");
    if (util.eql(ctx.q("with_blocks"), "1") or util.eql(ctx.q("with_blocks"), "true")) {
        const complexes = try db.jsonAgg(ctx.allocator, "SELECT id, complex_name, blocks_count, units_count, address, full_name, created_at FROM complex_managers ORDER BY complex_name");
        const blocks = try db.jsonAgg(ctx.allocator, "SELECT id, block_number, block_direction, full_name, created_at FROM block_managers ORDER BY block_number");
        const out = try std.fmt.allocPrint(ctx.allocator, "{{\"complexes\":{s},\"block_managers\":{s}}}", .{ complexes, blocks });
        return ctx.send(200, out);
    }
    return ctx.send(200, try db.jsonAgg(ctx.allocator, "SELECT id, complex_name, blocks_count, units_count, address, full_name, created_at FROM complex_managers ORDER BY complex_name"));
}

fn boardMembers(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        if (util.eql(ctx.q("presets"), "1") or util.eql(ctx.q("presets"), "true")) {
            return ctx.send(200,
                \\{"defaults":{"chat_complex_manager":true,"view_blocks":true},"presets":{},"titles":["مسئول مالی","مسئول تأسیسات","برقکار","مسئول نگهبانی"]}
            );
        }
        if (ctx.q("id").len > 0) {
            const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM board_members WHERE id = {d}", .{try parseId(ctx.q("id"))}));
            if (util.eql(row, "null")) return ctx.fail(404, "عضو یافت نشد");
            return ctx.send(200, try stripPassword(ctx.allocator, row));
        }
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice("SELECT * FROM board_members");
        if (ctx.q("complex_name").len > 0) try sql.writer().print(" WHERE complex_name = {s}", .{try ctx.lit(ctx.q("complex_name"))});
        try sql.appendSlice(" ORDER BY created_at DESC");
        const rows = try db.jsonAgg(ctx.allocator, sql.items);
        return ctx.send(200, rows);
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const complex_name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "complex_name"));
        const full_name = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "full_name"));
        const title = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "title"));
        const password = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "password"));
        if (complex_name.len == 0) return ctx.fail(400, "نام مجتمع الزامی است");
        if (full_name.len == 0) return ctx.fail(400, "نام عضو الزامی است");
        if (title.len == 0) return ctx.fail(400, "سمت / عنوان الزامی است");
        if (password.len < 4) return ctx.fail(400, "رمز حداقل ۴ کاراکتر باشد");
        const perms: []const u8 = blk: {
            switch (body) {
                .object => |o| {
                    if (o.get("permissions")) |p| break :blk try std.json.stringifyAlloc(ctx.allocator, p, .{});
                },
                else => {},
            }
            break :blk "{}";
        };
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO board_members (complex_name, full_name, title, responsibility, phone, password, permissions, status, created_by) VALUES ({s},{s},{s},{s},{s},{s},{s}::jsonb,{s},{s}) RETURNING id",
            .{
                try ctx.lit(complex_name),
                try ctx.lit(full_name),
                try ctx.lit(title),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "responsibility")),
                try ctx.lit(try util.onlyDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "phone"))),
                try ctx.lit(password),
                try ctx.lit(perms),
                try ctx.lit(if (util.eql(try util.jsonStrAlloc(ctx.allocator, body, "status"), "inactive")) "inactive" else "active"),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by")),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM board_members WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, try stripPassword(ctx.allocator, row));
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        var sets = std.ArrayList(u8).init(ctx.allocator);
        try addSet(&sets, ctx, body, "full_name");
        try addSet(&sets, ctx, body, "title");
        try addSet(&sets, ctx, body, "responsibility");
        try addSet(&sets, ctx, body, "phone");
        try addSet(&sets, ctx, body, "status");
        if (util.jsonHas(body, "password")) {
            const pin = try util.toEnglishDigits(ctx.allocator, try util.jsonStrAlloc(ctx.allocator, body, "password"));
            if (sets.items.len > 0) try sets.appendSlice(", ");
            try sets.writer().print("password = {s}", .{try ctx.lit(pin)});
        }
        if (sets.items.len > 0) {
            try sets.appendSlice(", updated_at = now()");
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE board_members SET {s} WHERE id = {d}", .{ sets.items, id }));
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM board_members WHERE id = {d}", .{id}));
        return ctx.send(200, try stripPassword(ctx.allocator, row));
    }
    if (util.eql(ctx.m(), "DELETE")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM board_members WHERE id = {d}", .{id}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn workOrders(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice("SELECT * FROM board_work_orders WHERE 1=1");
        if (ctx.q("complex_name").len > 0) try sql.writer().print(" AND complex_name = {s}", .{try ctx.lit(ctx.q("complex_name"))});
        if (ctx.q("status").len > 0) try sql.writer().print(" AND status = {s}", .{try ctx.lit(ctx.q("status"))});
        if (ctx.q("assigned_member_id").len > 0) try sql.writer().print(" AND assigned_member_id = {d}", .{try parseId(ctx.q("assigned_member_id"))});
        try sql.appendSlice(" ORDER BY created_at DESC LIMIT 400");
        return ctx.send(200, try db.jsonAgg(ctx.allocator, sql.items));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO board_work_orders (complex_name, block_number, block_direction, title, body, status, assigned_member_id, created_by) VALUES ({s},{s},{s},{s},{s},{s},{s},{s}) RETURNING id",
            .{
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "complex_name")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_number")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_direction")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "title")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "body")),
                try ctx.lit(blk: {
                    const s = try util.jsonStrAlloc(ctx.allocator, body, "status");
                    break :blk if (s.len > 0) s else "ثبت‌شده";
                }),
                blk: {
                    const a = try util.jsonStrAlloc(ctx.allocator, body, "assigned_member_id");
                    if (a.len == 0) break :blk "NULL";
                    break :blk try std.fmt.allocPrint(ctx.allocator, "{d}", .{try parseId(a)});
                },
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by")),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM board_work_orders WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        var sets = std.ArrayList(u8).init(ctx.allocator);
        try addSet(&sets, ctx, body, "title");
        try addSet(&sets, ctx, body, "body");
        try addSet(&sets, ctx, body, "status");
        try addSet(&sets, ctx, body, "block_number");
        try addSet(&sets, ctx, body, "block_direction");
        if (sets.items.len > 0) {
            try sets.appendSlice(", updated_at = now()");
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE board_work_orders SET {s} WHERE id = {d}", .{ sets.items, id }));
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM board_work_orders WHERE id = {d}", .{id}));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM board_work_orders WHERE id = {d}", .{try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"))}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn bills(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.writer().print("SELECT {s} FROM bills b WHERE 1=1", .{BILL_COLS});
        if (ctx.q("unit_name").len > 0) try sql.writer().print(" AND b.unit_name = {s}", .{try ctx.lit(ctx.q("unit_name"))});
        if (ctx.q("block_number").len > 0) try sql.writer().print(" AND b.block_number = {s}", .{try ctx.lit(ctx.q("block_number"))});
        if (ctx.q("block_direction").len > 0) try sql.writer().print(" AND b.block_direction = {s}", .{try ctx.lit(ctx.q("block_direction"))});
        if (ctx.q("status").len > 0) try sql.writer().print(" AND b.status = {s}", .{try ctx.lit(ctx.q("status"))});
        try sql.appendSlice(" ORDER BY b.created_at DESC");
        return ctx.send(200, try db.jsonAgg(ctx.allocator, sql.items));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const action = try util.jsonStrAlloc(ctx.allocator, body, "action");
        if (util.eql(action, "submit_receipt")) {
            const bid = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
            const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "unit_name"));
            var url = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "attachment_url"));
            if (url.len == 0) {
                const b64 = try util.jsonStrAlloc(ctx.allocator, body, "fileBase64");
                if (b64.len > 0) {
                    const bytes = util.decodeDataUrl(ctx.allocator, b64) catch return ctx.fail(400, "فایل نامعتبر است");
                    url = try util.saveUpload(ctx.allocator, bytes, "jpg");
                }
            }
            if (url.len == 0) return ctx.fail(400, "پیوست رسید الزامی است");
            const created_by = try util.jsonStrAlloc(ctx.allocator, body, "created_by");
            const desc = try std.fmt.allocPrint(ctx.allocator, "[[RECEIPT_PENDING]]\n[[attach:{s}]]\n[[by:{s}]]\n[[at:now]]", .{ url, created_by });
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE bills SET status = 'در انتظار تایید', paid_at = now(), description = COALESCE(description,'') || {s} WHERE id = {d}", .{ try ctx.lit(desc), bid }));
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator,
                "INSERT INTO payment_receipts (bill_id, unit_name, title, amount, method, note, status, created_by) SELECT id, unit_name, title, amount, 'ارسال توسط ساکن', {s}, 'در انتظار تایید', {s} FROM bills WHERE id = {d}",
                .{ try ctx.lit(url), try ctx.lit(if (created_by.len > 0) created_by else unit), bid },
            ));
            const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM bills b WHERE b.id = {d}", .{ BILL_COLS, bid }));
            return ctx.send(200, row);
        }
        const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "unit_name"));
        const title = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "title"));
        const amount = try util.jsonStrAlloc(ctx.allocator, body, "amount");
        if (unit.len == 0 or title.len == 0) return ctx.fail(400, "واحد و عنوان الزامی است");
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO bills (unit_name, block_number, block_direction, title, amount, due_date, description, status, created_by, created_by_role) VALUES ({s},{s},{s},{s},{s},{s},{s},'پرداخت‌نشده',{s},{s}) RETURNING id",
            .{
                try ctx.lit(unit),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_number")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_direction")),
                try ctx.lit(title),
                try ctx.lit(if (amount.len > 0) amount else "0"),
                blk: {
                    const d = try util.jsonStrAlloc(ctx.allocator, body, "due_date");
                    if (d.len == 0) break :blk "NULL";
                    break :blk try ctx.lit(d);
                },
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "description")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by_role")),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM bills b WHERE b.id = {d}", .{ BILL_COLS, try parseId(std.mem.trim(u8, idj, " \n\"")) }));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        var sets = std.ArrayList(u8).init(ctx.allocator);
        try addSet(&sets, ctx, body, "title");
        try addSet(&sets, ctx, body, "status");
        try addSet(&sets, ctx, body, "description");
        try addSet(&sets, ctx, body, "due_date");
        if (util.jsonHas(body, "amount")) {
            if (sets.items.len > 0) try sets.appendSlice(", ");
            try sets.writer().print("amount = {s}", .{try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "amount"))});
        }
        if (sets.items.len > 0) {
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE bills SET {s} WHERE id = {d}", .{ sets.items, id }));
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT {s} FROM bills b WHERE b.id = {d}", .{ BILL_COLS, id }));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM bills WHERE id = {d}", .{id}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn receipts(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice("SELECT * FROM receipts WHERE 1=1");
        if (ctx.q("unit_name").len > 0) try sql.writer().print(" AND unit_name = {s}", .{try ctx.lit(ctx.q("unit_name"))});
        if (ctx.q("block_number").len > 0) try sql.writer().print(" AND block_number = {s}", .{try ctx.lit(ctx.q("block_number"))});
        try sql.appendSlice(" ORDER BY created_at DESC");
        return ctx.send(200, try db.jsonAgg(ctx.allocator, sql.items));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO receipts (unit_name, block_number, block_direction, title, amount, method, note, status, created_by) VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{s}) RETURNING id",
            .{
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "unit_name")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_number")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_direction")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "title")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "amount")),
                try ctx.lit(blk: {
                    const mth = try util.jsonStrAlloc(ctx.allocator, body, "method");
                    break :blk if (mth.len > 0) mth else "نقدی";
                }),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "note")),
                try ctx.lit("ثبت‌شده"),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by")),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM receipts WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM receipts WHERE id = {d}", .{try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"))}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn paymentReceipts(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        const a = try db.jsonAgg(ctx.allocator, "SELECT * FROM payment_receipts ORDER BY id DESC");
        const b = try db.jsonAgg(ctx.allocator, "SELECT * FROM receipts ORDER BY id DESC");
        const out = try std.fmt.allocPrint(ctx.allocator, "{{\"payment_receipts\":{s},\"receipts\":{s}}}", .{ a, b });
        return ctx.send(200, out);
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO payment_receipts (bill_id, unit_name, block_number, block_direction, title, amount, method, note, status, created_by) VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{s},{s}) RETURNING id",
            .{
                blk: {
                    const id = try util.jsonStrAlloc(ctx.allocator, body, "bill_id");
                    if (id.len == 0) break :blk "NULL";
                    break :blk try std.fmt.allocPrint(ctx.allocator, "{d}", .{try parseId(id)});
                },
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "unit_name")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_number")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_direction")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "title")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "amount")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "method")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "note")),
                try ctx.lit("در انتظار تایید"),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by")),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM payment_receipts WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        var sets = std.ArrayList(u8).init(ctx.allocator);
        try addSet(&sets, ctx, body, "status");
        try addSet(&sets, ctx, body, "note");
        if (sets.items.len > 0) try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE payment_receipts SET {s} WHERE id = {d}", .{ sets.items, id }));
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM payment_receipts WHERE id = {d}", .{id}));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM payment_receipts WHERE id = {d}", .{id}));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM receipts WHERE id = {d}", .{id}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn receiptUpload(ctx: Ctx) !void {
    if (!util.eql(ctx.m(), "POST")) return ctx.fail(405, "Method not allowed");
    const body = ctx.json() catch return ctx.fail(400, "بدنه درخواست خالی است. تصویر را کوچک‌تر کنید یا دوباره بفرستید.");
    const action = try util.jsonStrAlloc(ctx.allocator, body, "action");
    if (util.eql(action, "sign")) {
        return ctx.send(200, "{\"ok\":true,\"direct\":true}");
    }
    const b64 = try util.jsonStrAlloc(ctx.allocator, body, "fileBase64");
    if (b64.len == 0) return ctx.fail(400, "فایل الزامی است");
    const bytes = util.decodeDataUrl(ctx.allocator, b64) catch return ctx.fail(400, "فایل نامعتبر است");
    const name = try util.jsonStrAlloc(ctx.allocator, body, "fileName");
    const ext: []const u8 = if (std.mem.endsWith(u8, name, ".pdf")) "pdf" else "jpg";
    const url = try util.saveUpload(ctx.allocator, bytes, ext);
    const out = try std.fmt.allocPrint(ctx.allocator, "{{\"ok\":true,\"url\":{s}}}", .{try jsonEncode(ctx.allocator, url)});
    return ctx.send(200, out);
}

fn blockExpenses(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice(
            \\SELECT i.*, COALESCE(m.expense_date,'') AS expense_date, COALESCE(m.attachment_url,'') AS attachment_url,
            \\COALESCE((SELECT json_agg(it) FROM block_expense_items it WHERE it.invoice_id = i.id), '[]'::json) AS items
            \\FROM block_expense_invoices i
            \\LEFT JOIN block_expense_meta m ON m.invoice_id = i.id
            \\WHERE 1=1
        );
        if (ctx.q("block_number").len > 0) try sql.writer().print(" AND i.block_number = {s}", .{try ctx.lit(ctx.q("block_number"))});
        if (ctx.q("block_direction").len > 0) try sql.writer().print(" AND i.block_direction = {s}", .{try ctx.lit(ctx.q("block_direction"))});
        try sql.appendSlice(" ORDER BY i.created_at DESC");
        return ctx.send(200, try db.jsonAgg(ctx.allocator, sql.items));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO block_expense_invoices (block_number, block_direction, invoice_no, note, total_amount, created_by) VALUES ({s},{s},{s},{s},{s},{s}) RETURNING id",
            .{
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_number")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_direction")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "invoice_no")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "note")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "total_amount")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by")),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const iid = try parseId(std.mem.trim(u8, idj, " \n\""));
        try insertExpenseItems(ctx, body, iid);
        const date = try util.jsonStrAlloc(ctx.allocator, body, "expense_date");
        const att = try util.jsonStrAlloc(ctx.allocator, body, "attachment_url");
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "INSERT INTO block_expense_meta (invoice_id, expense_date, attachment_url) VALUES ({d},{s},{s})", .{ iid, try ctx.lit(date), try ctx.lit(att) }));
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM block_expense_invoices WHERE id = {d}", .{iid}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        var sets = std.ArrayList(u8).init(ctx.allocator);
        try addSet(&sets, ctx, body, "note");
        try addSet(&sets, ctx, body, "invoice_no");
        if (util.jsonHas(body, "total_amount")) {
            if (sets.items.len > 0) try sets.appendSlice(", ");
            try sets.writer().print("total_amount = {s}", .{try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "total_amount"))});
        }
        if (sets.items.len > 0) try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE block_expense_invoices SET {s} WHERE id = {d}", .{ sets.items, id }));
        if (util.jsonHas(body, "items")) {
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM block_expense_items WHERE invoice_id = {d}", .{id}));
            try insertExpenseItems(ctx, body, id);
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM block_expense_invoices WHERE id = {d}", .{id}));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM block_expense_items WHERE invoice_id = {d}", .{id}));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM block_expense_meta WHERE invoice_id = {d}", .{id}));
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM block_expense_invoices WHERE id = {d}", .{id}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn insertExpenseItems(ctx: Ctx, body: std.json.Value, invoice_id: i64) !void {
    const items = switch (body) {
        .object => |o| o.get("items") orelse return,
        else => return,
    };
    const arr = switch (items) {
        .array => |a| a,
        else => return,
    };
    for (arr.items) |it| {
        const title = util.trim(try util.jsonStrAlloc(ctx.allocator, it, "title"));
        const amount = try util.jsonStrAlloc(ctx.allocator, it, "amount");
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "INSERT INTO block_expense_items (invoice_id, title, amount) VALUES ({d},{s},{s})", .{ invoice_id, try ctx.lit(title), try ctx.lit(if (amount.len > 0) amount else "0") }));
    }
}

fn blockFinance(ctx: Ctx) !void {
    if (!util.eql(ctx.m(), "GET")) return ctx.fail(405, "Method not allowed");
    const bn = ctx.q("block_number");
    const bd = ctx.q("block_direction");
    if (bn.len == 0 or bd.len == 0) return ctx.fail(400, "شماره و جهت بلوک الزامی است");
    const sql = try std.fmt.allocPrint(ctx.allocator,
        \\SELECT json_build_object(
        \\  'residents', (SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT id, unit_name, first_name, last_name, status FROM residents WHERE block_number = {s} AND block_direction = {s}) t),
        \\  'bills', (SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT id, unit_name, amount, status, title FROM bills WHERE block_number = {s} AND block_direction = {s}) t),
        \\  'expenses', (SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT id, total_amount FROM block_expense_invoices WHERE block_number = {s} AND block_direction = {s}) t)
        \\)::text
    , .{ try ctx.lit(bn), try ctx.lit(bd), try ctx.lit(bn), try ctx.lit(bd), try ctx.lit(bn), try ctx.lit(bd) });
    return ctx.send(200, try db.exec(ctx.allocator, sql));
}

fn blockBackup(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        const bn = ctx.q("block_number");
        const bd = ctx.q("block_direction");
        const sql = try std.fmt.allocPrint(ctx.allocator,
            \\SELECT json_build_object(
            \\  'version', 1,
            \\  'block_number', {s}::text,
            \\  'block_direction', {s}::text,
            \\  'residents', (SELECT COALESCE(json_agg(r), '[]'::json) FROM residents r WHERE r.block_number = {s} AND r.block_direction = {s}),
            \\  'bills', (SELECT COALESCE(json_agg(b), '[]'::json) FROM bills b WHERE b.block_number = {s} AND b.block_direction = {s})
            \\)::text
        , .{ try ctx.lit(bn), try ctx.lit(bd), try ctx.lit(bn), try ctx.lit(bd), try ctx.lit(bn), try ctx.lit(bd) });
        return ctx.send(200, try db.exec(ctx.allocator, sql));
    }
    if (util.eql(ctx.m(), "POST")) {
        return ctx.send(200, "{\"ok\":true,\"restored\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn monthlyCharge(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        return ctx.send(200, try db.jsonAgg(ctx.allocator, "SELECT * FROM bills WHERE title ILIKE '%شارژ ماهیانه%' ORDER BY created_at DESC LIMIT 2000"));
    }
    if (!util.eql(ctx.m(), "POST")) return ctx.fail(405, "Method not allowed");
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    const amount = try util.jsonStrAlloc(ctx.allocator, body, "amount");
    const title = blk: {
        const t = try util.jsonStrAlloc(ctx.allocator, body, "title");
        if (t.len > 0) break :blk t;
        break :blk "شارژ ماهیانه";
    };
    const residents_json = try db.jsonAgg(ctx.allocator, "SELECT unit_name, block_number, block_direction FROM residents WHERE status IS DISTINCT FROM 'blocked'");
    const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, residents_json, .{});
    const arr = switch (parsed.value) {
        .array => |a| a,
        else => return ctx.send(200, "[]"),
    };
    var created = std.ArrayList(u8).init(ctx.allocator);
    try created.append('[');
    var first = true;
    for (arr.items) |row| {
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO bills (unit_name, block_number, block_direction, title, amount, status, created_by, created_by_role) VALUES ({s},{s},{s},{s},{s},'پرداخت‌نشده',{s},'complex_manager') RETURNING id",
            .{
                try ctx.lit(util.jsonStr(row, "unit_name")),
                try ctx.lit(util.jsonStr(row, "block_number")),
                try ctx.lit(util.jsonStr(row, "block_direction")),
                try ctx.lit(title),
                try ctx.lit(if (amount.len > 0) amount else "0"),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "created_by")),
            },
        );
        _ = try db.exec(ctx.allocator, ins);
        if (!first) try created.append(',');
        first = false;
        try created.appendSlice("{\"ok\":true}");
    }
    try created.append(']');
    return ctx.send(201, created.items);
}

fn messages(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        const at = ctx.q("audience_type");
        var keys = ctx.q("audience_keys");
        if (keys.len == 0) keys = ctx.q("audience_key");
        if (at.len == 0 or keys.len == 0) return ctx.fail(400, "audience_type و audience_key الزامی است");
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.writer().print("SELECT id, tab_key, is_read, audience_key, title, body, created_at, audience_type FROM panel_messages WHERE audience_type = {s} AND (audience_key = 'all'", .{try ctx.lit(at)});
        var it = std.mem.splitScalar(u8, keys, ',');
        while (it.next()) |k| {
            const t = util.trim(k);
            if (t.len == 0) continue;
            try sql.writer().print(" OR audience_key = {s}", .{try ctx.lit(t)});
        }
        try sql.appendSlice(") ORDER BY created_at DESC LIMIT 500");
        const list = try db.jsonAgg(ctx.allocator, sql.items);
        if (util.eql(ctx.q("counts_only"), "1") or util.eql(ctx.q("counts_only"), "true")) {
            const out = try std.fmt.allocPrint(ctx.allocator, "{{\"messages\":{s},\"counts\":{{}},\"unread_total\":0}}", .{list});
            return ctx.send(200, out);
        }
        const out = try std.fmt.allocPrint(ctx.allocator, "{{\"messages\":{s},\"counts\":{{}},\"unread_total\":0}}", .{list});
        return ctx.send(200, out);
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO panel_messages (audience_type, audience_key, tab_key, title, body, is_read) VALUES ({s},{s},{s},{s},{s}, false) RETURNING id",
            .{
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "audience_type")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "audience_key")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "tab_key")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "title")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "body")),
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM panel_messages WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const ids = try util.jsonStrAlloc(ctx.allocator, body, "id");
        if (ids.len > 0) {
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE panel_messages SET is_read = true WHERE id = {d}", .{try parseId(ids)}));
        } else {
            const at = try util.jsonStrAlloc(ctx.allocator, body, "audience_type");
            const ak = try util.jsonStrAlloc(ctx.allocator, body, "audience_key");
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE panel_messages SET is_read = true WHERE audience_type = {s} AND audience_key = {s}", .{ try ctx.lit(at), try ctx.lit(ak) }));
        }
        return ctx.send(200, "{\"ok\":true}");
    }
    if (util.eql(ctx.m(), "DELETE")) {
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM panel_messages WHERE id = {d}", .{try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"))}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn publicChat(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        return ctx.send(200, try db.jsonAgg(ctx.allocator, "SELECT * FROM public_chat_msgs ORDER BY created_at ASC LIMIT 300"));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        var text = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "message"));
        var audio_url: []const u8 = "";
        const mtype = try util.jsonStrAlloc(ctx.allocator, body, "message_type");
        if (util.eql(mtype, "voice")) {
            const b64 = try util.jsonStrAlloc(ctx.allocator, body, "audio_base64");
            const bytes = util.decodeDataUrl(ctx.allocator, b64) catch return ctx.fail(400, "فایل صوتی الزامی است");
            audio_url = try util.saveUpload(ctx.allocator, bytes, "webm");
            if (text.len == 0) text = "🎤 پیام صوتی";
        } else if (text.len == 0) return ctx.fail(400, "متن پیام الزامی است");
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO public_chat_msgs (unit_name, sender_name, message, message_type, audio_url) VALUES ({s},{s},{s},{s},{s}) RETURNING id",
            .{
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "unit_name")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "sender_name")),
                try ctx.lit(text),
                try ctx.lit(if (util.eql(mtype, "voice")) "voice" else "text"),
                if (audio_url.len > 0) try ctx.lit(audio_url) else "NULL",
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM public_chat_msgs WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM public_chat_msgs WHERE id = {d}", .{try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"))}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn privateChat(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice("SELECT * FROM private_chat_msgs WHERE 1=1");
        if (ctx.q("unit_name").len > 0) try sql.writer().print(" AND unit_name = {s}", .{try ctx.lit(ctx.q("unit_name"))});
        if (ctx.q("block_direction").len > 0) try sql.writer().print(" AND block_direction = {s}", .{try ctx.lit(ctx.q("block_direction"))});
        try sql.appendSlice(" ORDER BY created_at DESC LIMIT 800");
        return ctx.send(200, try db.jsonAgg(ctx.allocator, sql.items));
    }
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    if (util.eql(ctx.m(), "POST")) {
        var text = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "message"));
        var audio_url: []const u8 = "";
        const mtype = try util.jsonStrAlloc(ctx.allocator, body, "message_type");
        if (util.eql(mtype, "voice")) {
            const b64 = try util.jsonStrAlloc(ctx.allocator, body, "audio_base64");
            const bytes = util.decodeDataUrl(ctx.allocator, b64) catch return ctx.fail(400, "فایل صوتی الزامی است");
            audio_url = try util.saveUpload(ctx.allocator, bytes, "webm");
            if (text.len == 0) text = "🎤 پیام صوتی";
        }
        const ins = try std.fmt.allocPrint(ctx.allocator,
            "INSERT INTO private_chat_msgs (unit_name, block_number, block_direction, sender_type, sender_name, message, message_type, audio_url, is_read) VALUES ({s},{s},{s},{s},{s},{s},{s},{s}, false) RETURNING id",
            .{
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "unit_name")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_number")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "block_direction")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "sender_type")),
                try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "sender_name")),
                try ctx.lit(text),
                try ctx.lit(if (util.eql(mtype, "voice")) "voice" else "text"),
                if (audio_url.len > 0) try ctx.lit(audio_url) else "NULL",
            },
        );
        const idj = try db.exec(ctx.allocator, ins);
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM private_chat_msgs WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
        return ctx.send(201, row);
    }
    if (util.eql(ctx.m(), "PUT")) {
        const id = try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"));
        if (util.jsonHas(body, "is_read")) {
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE private_chat_msgs SET is_read = true WHERE id = {d}", .{id}));
        }
        if (util.jsonHas(body, "message")) {
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE private_chat_msgs SET message = {s} WHERE id = {d}", .{ try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "message")), id }));
        }
        const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM private_chat_msgs WHERE id = {d}", .{id}));
        return ctx.send(200, row);
    }
    if (util.eql(ctx.m(), "DELETE")) {
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "DELETE FROM private_chat_msgs WHERE id = {d}", .{try parseId(try util.jsonStrAlloc(ctx.allocator, body, "id"))}));
        return ctx.send(200, "{\"ok\":true}");
    }
    return ctx.fail(405, "Method not allowed");
}

fn staffChat(ctx: Ctx) !void {
    if (util.eql(ctx.m(), "GET")) {
        var sql = std.ArrayList(u8).init(ctx.allocator);
        try sql.appendSlice("SELECT * FROM staff_chats WHERE 1=1");
        if (ctx.q("block_number").len > 0) try sql.writer().print(" AND block_number = {s}", .{try ctx.lit(ctx.q("block_number"))});
        if (ctx.q("block_direction").len > 0) try sql.writer().print(" AND block_direction = {s}", .{try ctx.lit(ctx.q("block_direction"))});
        try sql.appendSlice(" ORDER BY created_at ASC LIMIT 400");
        return ctx.send(200, try db.jsonAgg(ctx.allocator, sql.items));
    }
    if (!util.eql(ctx.m(), "POST")) return ctx.fail(405, "Method not allowed");
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    var bn = try util.jsonStrAlloc(ctx.allocator, body, "block_number");
    var bd = try util.jsonStrAlloc(ctx.allocator, body, "block_direction");
    if (util.eql(try util.jsonStrAlloc(ctx.allocator, body, "channel"), "system_complex")) {
        bn = "__SYSTEM__";
        bd = try util.jsonStrAlloc(ctx.allocator, body, "complex_name");
    }
    var text = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "message"));
    var audio_url: []const u8 = "";
    const mtype = try util.jsonStrAlloc(ctx.allocator, body, "message_type");
    if (util.eql(mtype, "voice")) {
        const b64 = try util.jsonStrAlloc(ctx.allocator, body, "audio_base64");
        const bytes = util.decodeDataUrl(ctx.allocator, b64) catch return ctx.fail(400, "فایل صوتی الزامی است");
        audio_url = try util.saveUpload(ctx.allocator, bytes, "webm");
        if (text.len == 0) text = "🎤 پیام صوتی";
    }
    const ins = try std.fmt.allocPrint(ctx.allocator,
        "INSERT INTO staff_chats (block_number, block_direction, sender_role, sender_name, message, message_type, audio_url) VALUES ({s},{s},{s},{s},{s},{s},{s}) RETURNING id",
        .{
            try ctx.lit(bn),
            try ctx.lit(bd),
            try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "sender_role")),
            try ctx.lit(try util.jsonStrAlloc(ctx.allocator, body, "sender_name")),
            try ctx.lit(text),
            try ctx.lit(if (util.eql(mtype, "voice")) "voice" else "text"),
            if (audio_url.len > 0) try ctx.lit(audio_url) else "NULL",
        },
    );
    const idj = try db.exec(ctx.allocator, ins);
    const row = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT * FROM staff_chats WHERE id = {d}", .{try parseId(std.mem.trim(u8, idj, " \n\""))}));
    return ctx.send(201, row);
}

fn unitsImport(ctx: Ctx) !void {
    if (!util.eql(ctx.m(), "POST")) return ctx.fail(405, "Method not allowed");
    const body = ctx.json() catch return ctx.fail(400, "بدنه نامعتبر است");
    const action = try util.jsonStrAlloc(ctx.allocator, body, "action");
    const bn = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_number"));
    const bd = util.trim(try util.jsonStrAlloc(ctx.allocator, body, "block_direction"));
    const rows_v = switch (body) {
        .object => |o| o.get("rows") orelse o.get("items") orelse return ctx.fail(400, "ردیف‌ها الزامی است"),
        else => return ctx.fail(400, "ردیف‌ها الزامی است"),
    };
    const arr = switch (rows_v) {
        .array => |a| a,
        else => return ctx.fail(400, "ردیف‌ها الزامی است"),
    };
    var inserted: usize = 0;
    var updated: usize = 0;
    var skipped: usize = 0;
    var residents_touched: usize = 0;

    if (util.eql(action, "import_residents") or util.eql(action, "preview") or util.eql(action, "dry")) {
        for (arr.items) |row| {
            const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, row, "unit_name"));
            if (unit.len == 0) {
                skipped += 1;
                continue;
            }
            const occ = blk: {
                const o = util.trim(try util.jsonStrAlloc(ctx.allocator, row, "occupancy"));
                break :blk if (o.len > 0) o else "مالک";
            };
            const existing = try db.jsonRow(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "SELECT id FROM residents WHERE unit_name = {s} AND occupancy = {s} LIMIT 1", .{ try ctx.lit(unit), try ctx.lit(occ) }));
            if (!util.eql(existing, "null")) {
                const parsed = try std.json.parseFromSlice(std.json.Value, ctx.allocator, existing, .{});
                const rid = try parseId(try util.jsonStrAlloc(ctx.allocator, parsed.value, "id"));
                var sets = std.ArrayList(u8).init(ctx.allocator);
                try addSet(&sets, ctx, row, "first_name");
                try addSet(&sets, ctx, row, "last_name");
                try addSet(&sets, ctx, row, "floor");
                try addSet(&sets, ctx, row, "phone");
                if (sets.items.len > 0) {
                    try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE residents SET {s} WHERE id = {d}", .{ sets.items, rid }));
                }
                updated += 1;
                residents_touched += 1;
            } else {
                const pin = blk: {
                    const p = try util.toEnglishDigits(ctx.allocator, util.trim(try util.jsonStrAlloc(ctx.allocator, row, "pin")));
                    break :blk if (p.len >= 4) p else "1234";
                };
                try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator,
                    "INSERT INTO residents (block_number, block_direction, unit_name, floor, occupancy, first_name, last_name, phone, pin, status) VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{s},'active')",
                    .{
                        try ctx.lit(bn),
                        try ctx.lit(bd),
                        try ctx.lit(unit),
                        try ctx.lit(try util.jsonStrAlloc(ctx.allocator, row, "floor")),
                        try ctx.lit(occ),
                        try ctx.lit(try util.jsonStrAlloc(ctx.allocator, row, "first_name")),
                        try ctx.lit(try util.jsonStrAlloc(ctx.allocator, row, "last_name")),
                        try ctx.lit(try util.jsonStrAlloc(ctx.allocator, row, "phone")),
                        try ctx.lit(pin),
                    },
                ));
                inserted += 1;
                residents_touched += 1;
            }
        }
        const out = try std.fmt.allocPrint(ctx.allocator, "{{\"ok\":true,\"inserted\":{d},\"updated\":{d},\"skipped\":{d},\"residentsTouched\":{d},\"errors\":[]}}", .{ inserted, updated, skipped, residents_touched });
        return ctx.send(200, out);
    }

    if (util.eql(action, "import_bills")) {
        const created_by = try util.jsonStrAlloc(ctx.allocator, body, "created_by");
        const created_by_role = try util.jsonStrAlloc(ctx.allocator, body, "created_by_role");
        for (arr.items) |row| {
            const unit = util.trim(try util.jsonStrAlloc(ctx.allocator, row, "unit_name"));
            const title = util.trim(try util.jsonStrAlloc(ctx.allocator, row, "title"));
            if (unit.len == 0 or title.len == 0) {
                skipped += 1;
                continue;
            }
            const amount = try util.jsonStrAlloc(ctx.allocator, row, "amount");
            const due = try util.jsonStrAlloc(ctx.allocator, row, "due_date");
            try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator,
                "INSERT INTO bills (unit_name, block_number, block_direction, title, amount, due_date, description, status, created_by, created_by_role) VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{s},{s})",
                .{
                    try ctx.lit(unit),
                    try ctx.lit(bn),
                    try ctx.lit(bd),
                    try ctx.lit(title),
                    try ctx.lit(if (amount.len > 0) amount else "0"),
                    if (due.len > 0) try ctx.lit(due) else "NULL",
                    try ctx.lit(try util.jsonStrAlloc(ctx.allocator, row, "description")),
                    try ctx.lit(blk: {
                        const st = try util.jsonStrAlloc(ctx.allocator, row, "status");
                        break :blk if (st.len > 0) st else "پرداخت‌نشده";
                    }),
                    try ctx.lit(created_by),
                    try ctx.lit(created_by_role),
                },
            ));
            inserted += 1;
        }
        const out = try std.fmt.allocPrint(ctx.allocator, "{{\"ok\":true,\"inserted\":{d},\"updated\":{d},\"skipped\":{d},\"residentsTouched\":{d},\"errors\":[]}}", .{ inserted, updated, skipped, residents_touched });
        return ctx.send(200, out);
    }

    const out = try std.fmt.allocPrint(ctx.allocator, "{{\"ok\":true,\"inserted\":{d},\"updated\":0,\"skipped\":{d}}}", .{ arr.items.len, skipped });
    return ctx.send(200, out);
}

fn serveUpload(ctx: Ctx) !void {
    const name = ctx.req.path["/uploads/".len..];
    if (name.len == 0 or std.mem.indexOfScalar(u8, name, '/') != null or std.mem.indexOfScalar(u8, name, '\\') != null) {
        return ctx.fail(404, "Not found");
    }
    const dir = util.uploadDir();
    const path = try std.fmt.allocPrint(ctx.allocator, "{s}/{s}", .{ dir, name });
    const file = std.fs.cwd().openFile(path, .{}) catch return ctx.fail(404, "Not found");
    defer file.close();
    const data = try file.readToEndAlloc(ctx.allocator, 20 * 1024 * 1024);
    const ctype: []const u8 = if (std.mem.endsWith(u8, name, ".pdf")) "application/pdf" else if (std.mem.endsWith(u8, name, ".webm")) "audio/webm" else "image/jpeg";
    try http.send(ctx.stream, 200, "OK", ctype, data);
}

fn upsertPeople(ctx: Ctx, unit: []const u8, count: []const u8, bn: []const u8, bd: []const u8, rid: i64) !void {
    const pc = if (count.len == 0) "1" else count;
    const sql = try std.fmt.allocPrint(ctx.allocator,
        \\INSERT INTO resident_people_counts (unit_name, people_count, block_number, block_direction, resident_id, updated_at)
        \\VALUES ({s},{s},{s},{s},{s}, now())
        \\ON CONFLICT (unit_name) DO UPDATE SET people_count = EXCLUDED.people_count, updated_at = now()
    , .{
        try ctx.lit(unit),
        try ctx.lit(pc),
        try ctx.lit(bn),
        try ctx.lit(bd),
        if (rid > 0) try std.fmt.allocPrint(ctx.allocator, "{d}", .{rid}) else "NULL",
    });
    try db.execOk(ctx.allocator, sql);
}

fn upsertOccupant(ctx: Ctx, rid: i64, unit: []const u8, bn: []const u8, bd: []const u8, flag: bool) !void {
    if (flag) {
        try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator, "UPDATE resident_occupant_flags SET is_occupant = false, updated_at = now() WHERE unit_name = {s} AND resident_id <> {d}", .{ try ctx.lit(unit), rid }));
    }
    try db.execOk(ctx.allocator, try std.fmt.allocPrint(ctx.allocator,
        \\INSERT INTO resident_occupant_flags (resident_id, unit_name, block_number, block_direction, is_occupant, updated_at)
        \\VALUES ({d},{s},{s},{s},{s}, now())
        \\ON CONFLICT (resident_id) DO UPDATE SET is_occupant = EXCLUDED.is_occupant, updated_at = now()
    , .{ rid, try ctx.lit(unit), try ctx.lit(bn), try ctx.lit(bd), if (flag) "true" else "false" }));
}

fn notify(ctx: Ctx, audience_type: []const u8, audience_key: []const u8, tab_key: []const u8, title: []const u8, body: []const u8) !void {
    const sql = try std.fmt.allocPrint(ctx.allocator, "INSERT INTO panel_messages (audience_type, audience_key, tab_key, title, body, is_read) VALUES ({s},{s},{s},{s},{s}, false)", .{ try ctx.lit(audience_type), try ctx.lit(audience_key), try ctx.lit(tab_key), try ctx.lit(title), try ctx.lit(body) });
    db.execOk(ctx.allocator, sql) catch {};
}

fn addSet(sets: *std.ArrayList(u8), ctx: Ctx, body: std.json.Value, key: []const u8) !void {
    if (!util.jsonHas(body, key)) return;
    const val = try util.jsonStrAlloc(ctx.allocator, body, key);
    if (sets.items.len > 0) try sets.appendSlice(", ");
    try sets.writer().print("{s} = {s}", .{ key, try ctx.lit(val) });
}

fn parseId(s: []const u8) !i64 {
    const t = util.trim(s);
    return std.fmt.parseInt(i64, t, 10) catch error.BadId;
}

fn jsonEncode(allocator: std.mem.Allocator, s: []const u8) ![]u8 {
    var out = std.ArrayList(u8).init(allocator);
    try std.json.stringify(s, .{}, out.writer());
    return out.toOwnedSlice();
}

fn stripPassword(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    var parsed = std.json.parseFromSlice(std.json.Value, allocator, raw, .{}) catch return allocator.dupe(u8, raw);
    switch (parsed.value) {
        .object => |*o| {
            _ = o.swapRemove("password");
        },
        else => {},
    }
    return std.json.stringifyAlloc(allocator, parsed.value, .{});
}
