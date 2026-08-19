const std = @import("std");
const builtin = @import("builtin");

pub fn build(b: *std.Build) void {
    // Native CPU detection on some WSL hosts yields invalid models (e.g. athlon-xp).
    var query = std.Target.Query{
        .cpu_arch = builtin.cpu.arch,
        .os_tag = builtin.os.tag,
        .abi = builtin.abi,
        .cpu_model = .baseline,
    };
    const nix_ld = findNixLdLinux(b);
    if (nix_ld) |ld| {
        query.dynamic_linker = std.Target.DynamicLinker.init(ld);
    }
    const target = b.standardTargetOptions(.{ .default_target = query });
    const optimize = b.standardOptimizeOption(.{});

    const exe = b.addExecutable(.{
        .name = "agon-backend",
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    exe.linkLibC();
    addLibpq(b, exe);
    if (nix_ld) |ld| {
        if (std.fs.path.dirname(ld)) |dir| addAbs(exe, dir, .lib);
    }
    exe.linkSystemLibrary("pq");
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);

    const run_step = b.step("run", "Run the Agon HTTP API");
    run_step.dependOn(&run_cmd.step);
}

fn findNixLdLinux(b: *std.Build) ?[]const u8 {
    const pc = std.process.Child.run(.{
        .allocator = b.allocator,
        .argv = &.{ "pkg-config", "--variable=libdir", "libpq" },
        .max_output_bytes = 4096,
    }) catch return null;
    defer b.allocator.free(pc.stdout);
    defer b.allocator.free(pc.stderr);
    const libdir = std.mem.trim(u8, pc.stdout, " \n\r\t");
    if (libdir.len == 0) return null;

    const so5 = std.fmt.allocPrint(b.allocator, "{s}/libpq.so.5", .{libdir}) catch return null;
    const so = std.fmt.allocPrint(b.allocator, "{s}/libpq.so", .{libdir}) catch return null;
    const libpq_so = blk: {
        std.fs.accessAbsolute(so5, .{}) catch {
            std.fs.accessAbsolute(so, .{}) catch return null;
            break :blk so;
        };
        break :blk so5;
    };

    const ldd = std.process.Child.run(.{
        .allocator = b.allocator,
        .argv = &.{ "ldd", libpq_so },
        .max_output_bytes = 16384,
    }) catch return null;
    defer b.allocator.free(ldd.stdout);
    defer b.allocator.free(ldd.stderr);

    var lines = std.mem.splitScalar(u8, ldd.stdout, '\n');
    while (lines.next()) |line| {
        if (std.mem.indexOf(u8, line, "ld-linux") == null) continue;
        var tok = std.mem.tokenizeAny(u8, line, " \t()");
        while (tok.next()) |p| {
            if (std.mem.startsWith(u8, p, "/nix/store/") and std.mem.indexOf(u8, p, "ld-linux") != null) {
                return b.allocator.dupe(u8, p) catch return null;
            }
        }
    }
    return null;
}

fn addLibpq(b: *std.Build, exe: *std.Build.Step.Compile) void {
    const allocator = b.allocator;

    pkgConfigFlags(b, exe, &.{ "pkg-config", "--cflags-only-I", "libpq" });
    pkgConfigFlags(b, exe, &.{ "pkg-config", "--libs-only-L", "libpq" });

    addColonPaths(allocator, exe, "C_INCLUDE_PATH", .include);
    addColonPaths(allocator, exe, "LIBRARY_PATH", .lib);
    addColonPaths(allocator, exe, "LD_LIBRARY_PATH", .lib);
}

const PathKind = enum { include, lib };

fn pkgConfigFlags(b: *std.Build, exe: *std.Build.Step.Compile, argv: []const []const u8) void {
    const out = std.process.Child.run(.{
        .allocator = b.allocator,
        .argv = argv,
        .max_output_bytes = 8192,
    }) catch return;
    defer b.allocator.free(out.stdout);
    defer b.allocator.free(out.stderr);
    const ok = switch (out.term) {
        .Exited => |code| code == 0,
        else => false,
    };
    if (!ok) return;

    var it = std.mem.tokenizeAny(u8, out.stdout, " \n\r\t");
    while (it.next()) |flag| {
        if (std.mem.startsWith(u8, flag, "-I") and flag.len > 2) {
            addAbs(exe, flag[2..], .include);
        } else if (std.mem.startsWith(u8, flag, "-L") and flag.len > 2) {
            addAbs(exe, flag[2..], .lib);
        }
    }
}

fn addColonPaths(allocator: std.mem.Allocator, exe: *std.Build.Step.Compile, env_name: []const u8, kind: PathKind) void {
    const val = std.process.getEnvVarOwned(allocator, env_name) catch return;
    defer allocator.free(val);
    var it = std.mem.tokenizeScalar(u8, val, ':');
    while (it.next()) |dir| {
        if (dir.len > 0) addAbs(exe, dir, kind);
    }
}

fn addAbs(exe: *std.Build.Step.Compile, dir: []const u8, kind: PathKind) void {
    const path: std.Build.LazyPath = .{ .cwd_relative = dir };
    switch (kind) {
        .include => exe.addSystemIncludePath(path),
        .lib => {
            exe.addLibraryPath(path);
            exe.addRPath(path);
        },
    }
}
