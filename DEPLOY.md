# راهنمای اجرا با Nix (بدون Docker)

این برنامه با **NixOS 25.05**، فرانت Next.js، بک‌اند Zig و PostgreSQL اجرا می‌شود.

## پیش‌نیاز
- Linux، macOS یا WSL
- اینترنت برای نصب اول Nix (بدون apt/dnf/pacman/brew)

## اجرا

```bash
chmod +x run.sh
./run.sh
```

- فرانت: http://127.0.0.1:3000
- API: http://127.0.0.1:4000/api/health
- ورود مدیر سیستم: `admin` / `admin`
- ورود مدیر بلوک (نمونه): بلوک `۷` شرقی / رمز `1234`

```bash
./run.sh --prep-only
./run.sh --force-setup
```

Schema: `database/schema.sql`  
Flake: `devops/flake.nix` (nixpkgs 25.05)
