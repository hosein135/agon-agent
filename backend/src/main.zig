const std = @import("std");
const db = @import("db.zig");
const http = @import("http.zig");
const handlers = @import("handlers.zig");
const util = @import("util.zig");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();

    try db.connect();
    {
        var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
        defer arena.deinit();
        db.ensureSessionsTable(arena.allocator()) catch |err| {
            std.log.err("ensure sessions table: {}", .{err});
        };
        db.ensureUploadsTable(arena.allocator()) catch |err| {
            std.log.err("ensure uploads table: {}", .{err});
        };
        db.purgeExpiredUploads(arena.allocator()) catch |err| {
            std.log.err("purge expired uploads: {}", .{err});
        };
        util.purgeDiskUploads() catch {};
    }
    const purge_thread = std.Thread.spawn(.{}, purgeUploadsLoop, .{}) catch null;
    if (purge_thread) |t| t.detach();
    std.log.info("postgres connected", .{});

    const host = envOr("HOST", "0.0.0.0");
    const port_s = envOr("PORT", envOr("BACKEND_PORT", "4000"));
    const port = std.fmt.parseInt(u16, port_s, 10) catch 4000;

    const addr = try std.net.Address.parseIp(host, port);
    var listener = try addr.listen(.{
        .reuse_address = true,
        .kernel_backlog = 4096,
    });
    defer listener.deinit();
    std.log.info("agon-backend listening on http://{s}:{d}", .{ host, port });

    while (true) {
        const conn = listener.accept() catch |err| {
            std.log.err("accept: {}", .{err});
            continue;
        };
        const thread = std.Thread.spawn(.{}, handleConn, .{conn}) catch {
            conn.stream.close();
            continue;
        };
        thread.detach();
    }
}

fn handleConn(conn: std.net.Server.Connection) void {
    defer conn.stream.close();
    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    const allocator = arena.allocator();
    const req = http.readRequest(allocator, conn.stream) catch {
        http.sendJson(conn.stream, 400, "{\"error\":\"bad request\"}") catch {};
        return;
    };
    const ctx = handlers.Ctx{
        .allocator = allocator,
        .stream = conn.stream,
        .req = req,
    };
    handlers.dispatch(ctx) catch |err| {
        std.log.err("handler: {}", .{err});
        http.sendJson(conn.stream, 500, "{\"error\":\"خطای سرور\"}") catch {};
    };
}

fn envOr(key: []const u8, fallback: []const u8) []const u8 {
    if (@hasDecl(std.posix, "getenv")) {
        if (std.posix.getenv(key)) |v| return v;
    } else if (std.os.getenv(key)) |v| return v;
    return fallback;
}

fn purgeUploadsLoop() void {
    while (true) {
        std.time.sleep(60 * 60 * std.time.ns_per_s);
        var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
        defer arena.deinit();
        db.purgeExpiredUploads(arena.allocator()) catch |err| {
            std.log.err("purge expired uploads: {}", .{err});
        };
        util.purgeDiskUploads() catch {};
    }
}
