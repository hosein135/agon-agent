const std = @import("std");

pub const Request = struct {
    method: []const u8,
    path: []const u8,
    query: []const u8,
    body: []const u8,
    content_type: []const u8,
    authorization: []const u8,
};

pub fn readRequest(allocator: std.mem.Allocator, stream: std.net.Stream) !Request {
    var data = std.ArrayList(u8).init(allocator);
    var tmp: [4096]u8 = undefined;
    var header_end: ?usize = null;
    var content_length: usize = 0;

    while (data.items.len < 32 * 1024 * 1024) {
        const n = try stream.read(&tmp);
        if (n == 0) break;
        try data.appendSlice(tmp[0..n]);
        if (header_end == null) {
            if (std.mem.indexOf(u8, data.items, "\r\n\r\n")) |idx| {
                header_end = idx + 4;
                content_length = parseContentLength(data.items[0..idx]);
            }
        }
        if (header_end) |end| {
            if (data.items.len >= end + content_length) break;
        }
    }

    const end = header_end orelse return error.BadRequest;
    const head = data.items[0 .. end - 4];
    var line_it = std.mem.splitSequence(u8, head, "\r\n");
    const request_line = line_it.next() orelse return error.BadRequest;
    var tok = std.mem.tokenizeScalar(u8, request_line, ' ');
    const method = tok.next() orelse return error.BadRequest;
    const target = tok.next() orelse return error.BadRequest;

    var path = target;
    var query: []const u8 = "";
    if (std.mem.indexOfScalar(u8, target, '?')) |q| {
        path = target[0..q];
        query = target[q + 1 ..];
    }

    var ctype: []const u8 = "";
    var authorization: []const u8 = "";
    while (line_it.next()) |line| {
        if (line.len >= 13 and std.ascii.eqlIgnoreCase(line[0..13], "content-type:")) {
            ctype = std.mem.trim(u8, line[13..], " \t");
        } else if (line.len >= 15 and std.ascii.eqlIgnoreCase(line[0..15], "authorization:")) {
            authorization = std.mem.trim(u8, line[15..], " \t");
        }
    }

    const body = if (end + content_length <= data.items.len)
        data.items[end .. end + content_length]
    else
        data.items[end..];

    return .{
        .method = method,
        .path = path,
        .query = query,
        .body = body,
        .content_type = ctype,
        .authorization = authorization,
    };
}

fn parseContentLength(head: []const u8) usize {
    var it = std.mem.splitSequence(u8, head, "\r\n");
    _ = it.next();
    while (it.next()) |line| {
        if (line.len >= 15 and std.ascii.eqlIgnoreCase(line[0..15], "content-length:")) {
            const raw = std.mem.trim(u8, line[15..], " \t");
            return std.fmt.parseInt(usize, raw, 10) catch 0;
        }
    }
    return 0;
}

pub fn send(stream: std.net.Stream, status: u16, reason: []const u8, content_type: []const u8, body: []const u8) !void {
    var header: [512]u8 = undefined;
    const h = try std.fmt.bufPrint(
        &header,
        "HTTP/1.1 {d} {s}\r\nContent-Type: {s}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With\r\nContent-Length: {d}\r\nConnection: close\r\n\r\n",
        .{ status, reason, content_type, body.len },
    );
    try stream.writeAll(h);
    try stream.writeAll(body);
}

pub fn sendJson(stream: std.net.Stream, status: u16, body: []const u8) !void {
    const reason: []const u8 = switch (status) {
        200 => "OK",
        201 => "Created",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        else => "Error",
    };
    try send(stream, status, reason, "application/json; charset=utf-8", body);
}
