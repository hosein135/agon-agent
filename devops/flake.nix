{
  description = "Agon agent — NixOS 25.05 (Zig backend, Next.js frontend, PostgreSQL)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
  };

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          pg = pkgs.postgresql;
        in {
          default = pkgs.mkShell {
            name = "agon-agent";
            packages = with pkgs; [
              zig_0_13
              pkg-config
              pg
              pg.dev
              nodejs_22
              python3
              curl
              git
              gnumake
              gcc
              coreutils
              gnused
              gnutar
              gzip
              bash
            ];
            PGHOST = "127.0.0.1";
            PGPORT = "5432";
            PGUSER = "agon";
            PGPASSWORD = "agon";
            PGDATABASE = "agon";
            BACKEND_PORT = "4000";
            BACKEND_URL = "http://127.0.0.1:4000";
            PORT = "3000";
            shellHook = ''
              export PGDATA="''${AGON_PGDATA:-$PWD/.agon-data/pg}"
              export DATABASE_URL="''${DATABASE_URL:-host=127.0.0.1 port=5432 dbname=agon user=agon password=agon}"
              export C_INCLUDE_PATH="${pg.dev}/include''${C_INCLUDE_PATH:+:$C_INCLUDE_PATH}"
              export LIBRARY_PATH="${pg.lib}/lib''${LIBRARY_PATH:+:$LIBRARY_PATH}"
              export PKG_CONFIG_PATH="${pg.dev}/lib/pkgconfig''${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
              export LD_LIBRARY_PATH="${pg.lib}/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
              echo "[agon] NixOS 25.05 shell — zig + node + postgres"
            '';
          };
        });
    };
}
