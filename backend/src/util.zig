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

pub fn uploadDir() []const u8 {
    if (@hasDecl(std.posix, "getenv")) {
        if (std.posix.getenv("UPLOAD_DIR")) |v| return v;
    } else if (std.os.getenv("UPLOAD_DIR")) |v| return v;
    return "backend/uploads";
}

pub fn decodeDataUrl(allocator: std.mem.Allocator, raw: []const u8) ![]u8 {
    var payload = raw;
    if (std.mem.indexOf(u8, raw, "base64,")) |idx| {
        payload = raw[idx + 7 ..];
    }
    var cleaned = std.ArrayList(u8).init(allocator);
    for (payload) |ch| {
        if (ch != ' ' and ch != '\n' and ch != '\r' and ch != '\t') try cleaned.append(ch);
    }
    const encoded = cleaned.items;
    const decoder = std.base64.standard.Decoder;
    const size = decoder.calcSizeForSlice(encoded) catch return error.BadBase64;
    const out = try allocator.alloc(u8, size);
    decoder.decode(out, encoded) catch return error.BadBase64;
    return out;
}

pub fn saveUpload(allocator: std.mem.Allocator, bytes: []const u8, ext: []const u8) ![]u8 {
    const dir = uploadDir();
    std.fs.cwd().makePath(dir) catch {};
    const stamp = std.time.milliTimestamp();
    const name = try std.fmt.allocPrint(allocator, "{d}_{d}.{s}", .{ stamp, bytes.len % 997, ext });
    const rel = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ dir, name });
    var file = try std.fs.cwd().createFile(rel, .{});
    defer file.close();
    try file.writeAll(bytes);
    return std.fmt.allocPrint(allocator, "/uploads/{s}", .{name});
}
