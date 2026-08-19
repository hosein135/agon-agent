const std = @import("std");

const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC = "٠١٢٣٤٥٦٧٨٩";

pub fn toEnglishDigits(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    var out = std.ArrayList(u8).init(allocator);
    var i: usize = 0;
    while (i < value.len) {
        var matched = false;
        var d: u8 = 0;
        while (d < 10) : (d += 1) {
            const p = PERSIAN[d * 2 .. d * 2 + 2];
            const a = ARABIC[d * 2 .. d * 2 + 2];
            if (i + 2 <= value.len and std.mem.eql(u8, value[i .. i + 2], p)) {
                try out.append('0' + d);
                i += 2;
                matched = true;
                break;
            }
            if (i + 2 <= value.len and std.mem.eql(u8, value[i .. i + 2], a)) {
                try out.append('0' + d);
                i += 2;
                matched = true;
                break;
            }
        }
        if (!matched) {
            try out.append(value[i]);
            i += 1;
        }
    }
    return out.toOwnedSlice();
}

pub fn onlyDigits(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    const en = try toEnglishDigits(allocator, value);
    defer allocator.free(en);
    var out = std.ArrayList(u8).init(allocator);
    for (en) |ch| {
        if (ch >= '0' and ch <= '9') try out.append(ch);
    }
    return out.toOwnedSlice();
}

pub fn trim(s: []const u8) []const u8 {
    return std.mem.trim(u8, s, " \t\r\n");
}

pub fn eql(a: []const u8, b: []const u8) bool {
    return std.mem.eql(u8, a, b);
}

pub fn jsonStr(val: std.json.Value, key: []const u8) []const u8 {
    const obj = switch (val) {
        .object => |o| o,
        else => return "",
    };
    const v = obj.get(key) orelse return "";
    return switch (v) {
        .string => |s| s,
        .null => "",
        else => "",
    };
}

pub fn jsonStrAlloc(allocator: std.mem.Allocator, val: std.json.Value, key: []const u8) ![]const u8 {
    const obj = switch (val) {
        .object => |o| o,
        else => return "",
    };
    const v = obj.get(key) orelse return "";
    return switch (v) {
        .string => |s| s,
        .null => "",
        .integer => |i| try std.fmt.allocPrint(allocator, "{d}", .{i}),
        .float => |f| try std.fmt.allocPrint(allocator, "{d}", .{f}),
        .bool => |b| if (b) "true" else "false",
        .number_string => |s| s,
        else => "",
    };
}

pub fn jsonBool(val: std.json.Value, key: []const u8) ?bool {
    const obj = switch (val) {
        .object => |o| o,
        else => return null,
    };
    const v = obj.get(key) orelse return null;
    return switch (v) {
        .bool => |b| b,
        .string => |s| eql(s, "true") or eql(s, "1") or eql(s, "t"),
        .integer => |i| i != 0,
        .float => |f| f != 0,
        else => null,
    };
}

pub fn jsonHas(val: std.json.Value, key: []const u8) bool {
    return switch (val) {
        .object => |o| o.get(key) != null,
        else => false,
    };
}

pub fn queryGet(query: []const u8, key: []const u8) ?[]const u8 {
    var it = std.mem.splitScalar(u8, query, '&');
    while (it.next()) |pair| {
        const eq = std.mem.indexOfScalar(u8, pair, '=') orelse continue;
        if (std.mem.eql(u8, pair[0..eq], key)) {
            return pair[eq + 1 ..];
        }
    }
    return null;
}

pub fn errJson(allocator: std.mem.Allocator, msg: []const u8) ![]u8 {
    var out = std.ArrayList(u8).init(allocator);
    try out.appendSlice("{\"error\":");
    try std.json.stringify(msg, .{}, out.writer());
    try out.append('}');
    return out.toOwnedSlice();
}

pub fn okMsg(allocator: std.mem.Allocator, msg: []const u8) ![]u8 {
    var out = std.ArrayList(u8).init(allocator);
    try out.appendSlice("{\"ok\":true,\"message\":");
    try std.json.stringify(msg, .{}, out.writer());
    try out.append('}');
    return out.toOwnedSlice();
}

pub fn nowIso(allocator: std.mem.Allocator) ![]u8 {
    const ts = std.time.timestamp();
    const epoch: u64 = @intCast(@max(ts, 0));
    const secs = epoch % 60;
    const mins_total = epoch / 60;
    const mins = mins_total % 60;
    const hours_total = mins_total / 60;
    const hours = hours_total % 24;
    const days = hours_total / 24;
    // crude UTC stamp; Postgres now() is used for stored timestamps
    return std.fmt.allocPrint(allocator, "{d}T{d:0>2}:{d:0>2}:{d:0>2}Z", .{ days, hours, mins, secs });
}

const db = @import("db.zig");

pub const max_upload_bytes: usize = 20 * 1024 * 1024;
const hex_digits = "0123456789abcdef";

pub const UploadMeta = struct {
    ext: []const u8,
    original_name: []const u8 = "",
    content_type: []const u8 = "",
    kind: []const u8 = "file",
    unit_name: []const u8 = "",
    block_number: []const u8 = "",
    block_direction: []const u8 = "",
    created_by: []const u8 = "",
};

pub fn uploadDir() []const u8 {
    if (@hasDecl(std.posix, "getenv")) {
        if (std.posix.getenv("UPLOAD_DIR")) |v| return v;
    } else if (std.os.getenv("UPLOAD_DIR")) |v| return v;
    return "backend/uploads";
}

pub fn decodeBase64(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    var cleaned = std.ArrayList(u8).init(allocator);
    for (raw) |ch| {
        if (ch != ' ' and ch != '\n' and ch != '\r' and ch != '\t') try cleaned.append(ch);
    }
    const encoded = cleaned.items;
    const decoder = std.base64.standard.Decoder;
    const size = decoder.calcSizeForSlice(encoded) catch return error.BadBase64;
    const out = try allocator.alloc(u8, size);
    decoder.decode(out, encoded) catch return error.BadBase64;
    return out;
}

pub fn decodeDataUrl(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    var payload = raw;
    if (std.mem.indexOf(u8, raw, "base64,")) |idx| {
        payload = raw[idx + 7 ..];
    }
    return decodeBase64(allocator, payload);
}

fn sanitizeExt(ext: []const u8) []const u8 {
    if (ext.len == 0 or ext.len > 8) return "bin";
    for (ext) |ch| {
        const ok = (ch >= 'a' and ch <= 'z') or (ch >= 'A' and ch <= 'Z') or (ch >= '0' and ch <= '9');
        if (!ok) return "bin";
    }
    return ext;
}

pub fn guessContentType(ext: []const u8, fallback: []const u8) []const u8 {
    if (eql(ext, "pdf")) return "application/pdf";
    if (eql(ext, "webm")) return "audio/webm";
    if (eql(ext, "png")) return "image/png";
    if (eql(ext, "jpg") or eql(ext, "jpeg")) return "image/jpeg";
    if (fallback.len > 0) return fallback;
    return "application/octet-stream";
}

fn toHex(allocator: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const out = try allocator.alloc(u8, bytes.len * 2);
    for (bytes, 0..) |b, i| {
        out[i * 2] = hex_digits[b >> 4];
        out[i * 2 + 1] = hex_digits[b & 15];
    }
    return out;
}

pub fn saveUpload(allocator: std.mem.Allocator, bytes: []const u8, meta: UploadMeta) ![]u8 {
    if (bytes.len == 0) return error.EmptyUpload;
    if (bytes.len > max_upload_bytes) return error.TooLarge;

    db.purgeExpiredUploads(allocator) catch {};
    purgeDiskUploads() catch {};

    const ext = sanitizeExt(meta.ext);
    const ctype = if (meta.content_type.len > 0) meta.content_type else guessContentType(ext, "");
    const kind = if (meta.kind.len > 0) meta.kind else "file";
    var rnd: [4]u8 = undefined;
    std.crypto.random.bytes(&rnd);
    const stamp = std.time.milliTimestamp();
    const public_id = try std.fmt.allocPrint(
        allocator,
        "{d}_{x:0>2}{x:0>2}{x:0>2}{x:0>2}.{s}",
        .{ stamp, rnd[0], rnd[1], rnd[2], rnd[3], ext },
    );
    const hex = try toHex(allocator, bytes);
    const orig = if (meta.original_name.len > 0) meta.original_name else public_id;
    const sql = try std.fmt.allocPrint(allocator,
        \\INSERT INTO uploads (public_id, original_name, content_type, kind, unit_name, block_number, block_direction, created_by, byte_size, content)
        \\VALUES ({s},{s},{s},{s},{s},{s},{s},{s},{d}, decode('{s}', 'hex'))
        \\RETURNING public_id
    , .{
        try db.lit(allocator, public_id),
        try db.lit(allocator, orig),
        try db.lit(allocator, ctype),
        try db.lit(allocator, kind),
        try db.lit(allocator, meta.unit_name),
        try db.lit(allocator, meta.block_number),
        try db.lit(allocator, meta.block_direction),
        try db.lit(allocator, meta.created_by),
        bytes.len,
        hex,
    });
    const returned = db.exec(allocator, sql) catch return error.Sql;
    const id = std.mem.trim(u8, returned, " \n\r\t\"");
    const name = if (id.len > 0) id else public_id;
    return std.fmt.allocPrint(allocator, "/uploads/{s}", .{name});
}

pub fn isSafeUploadName(name: []const u8) bool {
    if (name.len == 0 or name.len > 180) return false;
    if (eql(name, ".") or eql(name, "..")) return false;
    for (name) |ch| {
        const ok = (ch >= 'a' and ch <= 'z') or
            (ch >= 'A' and ch <= 'Z') or
            (ch >= '0' and ch <= '9') or
            ch == '_' or ch == '-' or ch == '.';
        if (!ok) return false;
    }
    return true;
}

pub fn purgeDiskUploads() !void {
    const dir_path = uploadDir();
    var dir = std.fs.cwd().openDir(dir_path, .{ .iterate = true }) catch return;
    defer dir.close();
    const cutoff_ns: i128 = @as(i128, std.time.nanoTimestamp()) - @as(i128, 60) * 24 * 60 * 60 * std.time.ns_per_s;
    var it = dir.iterate();
    while (true) {
        const next = it.next() catch break;
        const entry = next orelse break;
        if (entry.kind != .file) continue;
        const st = dir.statFile(entry.name) catch continue;
        if (st.mtime < cutoff_ns) {
            dir.deleteFile(entry.name) catch {};
        }
    }
}
