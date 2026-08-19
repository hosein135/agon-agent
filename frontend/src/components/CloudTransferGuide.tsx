import { useState } from 'react'
import {
  Cloud,
  CloudUpload,
  Shield,
  Smartphone,
  Monitor,
  Globe2,
  Flag,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Lock,
  FolderSync,
  Download,
  Upload,
  Link2,
  KeyRound,
  Server,
  Rocket,
  Database,
  Boxes,
  Terminal,
  Copy,
} from 'lucide-react'

const IR_SERVICES = [
  {
    id: 'arvan',
    name: 'فضای ابری آروان (Object Storage)',
    bestFor: 'پشتیبان‌گیری حرفه‌ای و امن فایل‌های اکسل/ZIP برنامه',
    site: 'https://www.arvancloud.ir',
    steps: [
      'وارد سایت ابر آروان شوید و حساب کاربری بسازید (احراز هویت ایرانی).',
      'از منوی محصولات، «فضای ابری / Object Storage» را فعال کنید.',
      'یک «باکت (Bucket)» جدید بسازید؛ نامی مثل block7-backup انتخاب کنید.',
      'دسترسی باکت را روی «خصوصی (Private)» بگذارید تا لینک عمومی نداشته باشد.',
      'از بخش کلیدها، Access Key و Secret Key بسازید و در جای امن نگه دارید.',
      'با پنل وب آروان یا نرم‌افزار S3-compatible (مثل Cyberduck / S3 Browser) وصل شوید.',
      'فایل خروجی اکسل یا پشتیبان ZIP برنامه را در پوشه‌ای مثل /backups/1405-05/ آپلود کنید.',
      'برای بازیابی: فایل را دانلود کنید و از تب «بازیابی از پشتیبان» مدیر بلوک وارد کنید.',
    ],
    tips: [
      'باکت را هرگز Public نکنید مگر برای فایل‌های عمومی غیرحساس.',
      'رمز فایل ZIP پشتیبان را جدا از ابر (مثلاً در دفترچه مدیر) نگه دارید.',
    ],
  },
  {
    id: 'parspack',
    name: 'پارس‌پک — فضای ابری / بکاپ',
    bestFor: 'مدیران ایرانی که هاست و بکاپ یکجا می‌خواهند',
    site: 'https://parspack.com',
    steps: [
      'در پارس‌پک ثبت‌نام و وارد پنل کاربری شوید.',
      'سرویس «فضای ابری» یا «بکاپ ابری» را تهیه/فعال کنید.',
      'کاربر FTP/SFTP یا لینک دسترسی پنل فایل را از پارس‌پک دریافت کنید.',
      'با FileZilla (پروتکل SFTP) یا مدیر فایل پنل به فضای خود وصل شوید.',
      'پوشه backup-block7 بسازید.',
      'فایل‌های Excel خروجی و ZIP پشتیبان را آپلود کنید.',
      'در صورت امکان Versioning یا نگه‌داری چند نسخه روزانه را روشن کنید.',
      'برای بازیابی، فایل را دانلود و در برنامه «بازیابی از پشتیبان» استفاده کنید.',
    ],
    tips: [
      'از رمز قوی برای FTP استفاده کنید و IP دسترسی را محدود کنید.',
      'هفته‌ای یک‌بار صحت دانلود تصادفی یک فایل را چک کنید.',
    ],
  },
  {
    id: 'liara',
    name: 'لیارا — Object Storage',
    bestFor: 'ذخیره S3-سازگار با پنل فارسی',
    site: 'https://liara.ir',
    steps: [
      'در لیارا حساب بسازید و وارد کنسول شوید.',
      'یک باکت Object Storage بسازید (منطقه نزدیک به خود را انتخاب کنید).',
      'کلید دسترسی (Access/Secret) بسازید.',
      'با نرم‌افزار Cyberduck نوع Amazon S3 را انتخاب و endpoint لیارا را وارد کنید.',
      'به باکت وصل شوید و پوشه backups را بسازید.',
      'فایل پشتیبان برنامه را Drag & Drop کنید.',
      'دسترسی عمومی باکت را غیرفعال نگه دارید.',
      'لینک موقت (Presigned) فقط در صورت نیاز به اشتراک محدود بسازید.',
    ],
    tips: [
      'endpoint و نام باکت را در دفترچه عملیات مجتمع یادداشت کنید.',
      'کلید Secret را در چت یا پیامک نفرستید.',
    ],
  },
  {
    id: 'mizban',
    name: 'هاست دانلود / فضای فایل ایرانی (عمومی)',
    bestFor: 'آرشیو حجیم وقتی Object Storage ندارید',
    site: 'پنل همان شرکت هاستینگ',
    steps: [
      'از شرکت هاستینگ خود «هاست دانلود» یا «فضای فایل» بخرید.',
      'با FTP/SFTP (FileZilla) به سرور وصل شوید.',
      'پوشه private یا خارج از public_html بسازید تا از وب مستقیم باز نشود.',
      'فایل‌های پشتیبان را آنجا آپلود کنید.',
      'در صورت اجبار به public_html، نام فایل را تصادفی و بدون لیست‌دایرکتوری بگذارید.',
      'دسترسی FTP را فقط به IP دفتر مدیریت محدود کنید (اگر پنل اجازه دهد).',
      'پس از آپلود، یک‌بار دانلود آزمایشی انجام دهید.',
      'هر ماه فایل‌های قدیمی‌تر از ۹۰ روز را آرشیو/حذف سیاست‌مند کنید.',
    ],
    tips: [
      'هرگز پوشه backup را بدون رمز و در root وب نگذارید.',
      'ترجیحاً Object Storage خصوصی به‌جای هاست دانلود عمومی.',
    ],
  },
  {
    id: 'nextcloud-ir',
    name: 'نکست‌کلود روی سرور ایران (خودمیزبان)',
    bestFor: 'فضای ابری کاملاً خصوصی تحت کنترل مجتمع',
    site: 'https://nextcloud.com (نصب روی سرور ایران)',
    steps: [
      'یک VPS ایرانی با سیستم‌عامل لینوکس تهیه کنید.',
      'Nextcloud را با نصب استاندارد لینوکس بالا بیاورید (یا از شرکت‌های نصب‌کننده کمک بگیرید).',
      'HTTPS (گواهی SSL) را اجباری کنید.',
      'کاربر admin و کاربر «مدیر بلوک» جدا بسازید.',
      'پوشه اشتراکی Block7-Backups فقط برای مدیران مجاز بسازید.',
      'اپ موبایل/دسکتاپ Nextcloud را نصب و با آدرس سرور خود وارد شوید.',
      'پوشه محلی backups را با پوشه ابری Sync کنید.',
      'پس از هر «پشتیبان‌گیری» در برنامه، فایل را در همان پوشه Sync بریزید تا خودکار آپلود شود.',
    ],
    tips: [
      '۲FA (ورود دو مرحله‌ای) را برای همه مدیران روشن کنید.',
      'اسنپ‌شات هفتگی از کل سرور Nextcloud بگیرید.',
    ],
  },
]

const WORLD_SERVICES = [
  {
    id: 'gdrive',
    name: 'Google Drive',
    bestFor: 'استفاده روزمره مدیران و همگام‌سازی با موبایل',
    site: 'https://drive.google.com',
    steps: [
      'با حساب Google وارد drive.google.com شوید.',
      'پوشه جدید بسازید: Block7-Private-Backups.',
      'روی پوشه راست‌کلیک → Share → General access را روی Restricted بگذارید.',
      'فقط ایمیل مدیران مجاز را با نقش Viewer یا Editor اضافه کنید.',
      'از برنامه: خروجی اکسل / پشتیبان را دانلود کنید.',
      'فایل را با Drag & Drop داخل پوشه Drive بیندازید (یا New → File upload).',
      'اختیاری: Google Drive for Desktop را نصب کنید تا پوشه سیستم Sync شود.',
      'برای بازیابی: فایل را Download و در تب بازیابی برنامه بارگذاری کنید.',
    ],
    tips: [
      'لینک Anyone with the link برای فایل پشتیبان نسازید.',
      'نام فایل را با تاریخ بگذارید: backup-block7-1405-05-12.zip',
    ],
  },
  {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    bestFor: 'کاربران ویندوز و Microsoft 365',
    site: 'https://onedrive.live.com',
    steps: [
      'وارد OneDrive شوید یا از File Explorer ویندوز پوشه OneDrive را باز کنید.',
      'پوشه Block7-Backups بسازید.',
      'Share → فقط افراد مشخص (Specific people)؛ لینک عمومی ندهید.',
      'فایل پشتیبان/اکسل را در پوشه کپی کنید تا خودکار Sync شود.',
      'در موبایل اپ OneDrive وضعیت آپلود را سبز/تمام‌شده ببینید.',
      'Version history را برای فایل‌های مهم چک کنید (بازیابی نسخه قبل).',
      'برای بازگردانی در برنامه: از OneDrive دانلود و بازیابی کنید.',
      'در Settings همگام‌سازی، Files On-Demand را متناسب با حجم دیسک تنظیم کنید.',
    ],
    tips: [
      'اگر لپ‌تاپ گم شد، از account.microsoft.com نشست‌ها را قطع کنید.',
      'رمز حساب Microsoft را با Authenticator دوعاملی کنید.',
    ],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    bestFor: 'اشتراک کنترل‌شده بین چند مدیر',
    site: 'https://www.dropbox.com',
    steps: [
      'حساب Dropbox بسازید و وارد شوید.',
      'پوشه team یا شخصی Block7 بسازید.',
      'Invite فقط ایمیل مدیران؛ دسترسی Edit/View را آگاهانه بدهید.',
      'Dropbox Desktop را نصب کنید تا پوشه محلی Sync شود.',
      'خروجی پشتیبان برنامه را در مسیر Dropbox\\Block7\\backups بگذارید.',
      'صبر کنید تا تیک آبی/سبز Sync کامل شود.',
      'در web.dropbox.com نسخه‌های قبلی فایل (Version history) را ببینید.',
      'برای بازیابی: دانلود از Dropbox → بازیابی در برنامه.',
    ],
    tips: [
      'لینک عمومی با انقضا (expiring link) فقط برای انتقال موقت.',
      'رمز دوم Dropbox را فعال کنید.',
    ],
  },
  {
    id: 'mega',
    name: 'MEGA',
    bestFor: 'رمزنگاری سمت کاربر (Zero-Knowledge) و حریم خصوصی بالاتر',
    site: 'https://mega.nz',
    steps: [
      'در mega.nz ثبت‌نام کنید و اپ دسکتاپ/موبایل را نصب کنید.',
      'Recovery Key را حتماً دانلود و آفلاین نگه دارید (بدون آن حساب برنمی‌گردد).',
      'پوشه Block7-Backups بسازید.',
      'فایل پشتیبان را آپلود کنید؛ رمزنگاری خودکار است.',
      'برای اشتراک با مدیر دیگر: Share folder با ایمیل او، نه لینک عمومی.',
      'اگر لینک لازم شد، Key را جدا و امن بفرستید.',
      'پس از آپلود، از دستگاه دیگر یک‌بار دانلود آزمایشی کنید.',
      'بازیابی: دانلود → تب بازیابی برنامه.',
    ],
    tips: [
      'Recovery Key را در چت نگذارید.',
      'حجم رایگان محدود است؛ آرشیو قدیمی را پاکسازی کنید.',
    ],
  },
  {
    id: 'pcloud',
    name: 'pCloud',
    bestFor: 'کسانی که Encryption (Crypto Folder) می‌خواهند',
    site: 'https://www.pcloud.com',
    steps: [
      'حساب pCloud بسازید و pCloud Drive را نصب کنید.',
      'در صورت امکان Crypto Folder را فعال کنید (رمز جدا).',
      'داخل Crypto یا پوشه عادی، Block7 بسازید.',
      'فایل پشتیبان را کپی کنید و از تکمیل Upload مطمئن شوید.',
      'دسترسی Share را محدود به افراد کنید.',
      'از وب‌پنل صحت وجود فایل را ببینید.',
      'بازیابی با دانلود از pCloud و ورود به برنامه.',
      'رمز Crypto را فقط مدیران ارشد بدانند.',
    ],
    tips: [
      'بدون رمز Crypto، حتی pCloud هم به محتوا دسترسی ندارد—رمز را گم نکنید.',
    ],
  },
  {
    id: 'nextcloud-world',
    name: 'Nextcloud / ownCloud (خارج یا خودمیزبان)',
    bestFor: 'ابر خصوصی سازمانی',
    site: 'https://nextcloud.com',
    steps: [
      'نمونه Nextcloud آماده (provider) بگیرید یا روی VPS نصب کنید.',
      'HTTPS و ۲FA را اجباری کنید.',
      'Group «Block Managers» بسازید و پوشه Backups را فقط به آن Group بدهید.',
      'کلاینت دسکتاپ را به سرور وصل و پوشه Sync تعریف کنید.',
      'خروجی‌های برنامه را در پوشه Sync بریزید.',
      'سیاست نگه‌داری (مثلاً ۱۲ نسخه آخر) را در Files/Versions تنظیم کنید.',
      'هر فصل یک Export کامل از Nextcloud روی هارد آفلاین بگیرید (۳-۲-۱).',
      'بازیابی از همان پوشه Sync یا وب.',
    ],
    tips: [
      'قانون ۳-۲-۱: ۳ کپی، ۲ رسانه مختلف، ۱ کپی خارج از محل.',
    ],
  },
]

const APP_FLOW = [
  {
    title: 'صدور خروجی از برنامه',
    icon: Download,
    body: 'در لایه مدیر بلوک → «خروجی و ورودی» → خروجی اکسل واحدها/قبوض، یا «پشتیبان‌گیری» برای فایل کامل‌تر روی دستگاه.',
  },
  {
    title: 'انتقال به ابر خصوصی',
    icon: CloudUpload,
    body: 'فایل دانلودشده را فقط در پوشه خصوصی ابر (ایرانی یا خارجی طبق راهنمای زیر) آپلود کنید. از ارسال در گروه عمومی چت خودداری کنید.',
  },
  {
    title: 'نام‌گذاری استاندارد',
    icon: FolderSync,
    body: 'مثال: block7-east-backup-1405-05-12.zip یا bills-export-1405-05-12.xlsx تا نسخه‌ها قاطی نشوند.',
  },
  {
    title: 'بازیابی',
    icon: Upload,
    body: 'فایل را از ابر دانلود کنید → در برنامه تب بازیابی/ورود از اکسل → پیش‌نمایش → تأیید مدیر → ثبت در دیتابیس.',
  },
]

function ServiceCard({ service, accent = 'sky' }) {
  const [open, setOpen] = useState(false)
  const border =
    accent === 'emerald'
      ? 'border-emerald-300'
      : accent === 'violet'
        ? 'border-violet-300'
        : 'border-sky-300'
  const head =
    accent === 'emerald'
      ? 'bg-emerald-50 text-emerald-950'
      : accent === 'violet'
        ? 'bg-violet-50 text-violet-950'
        : 'bg-sky-50 text-sky-950'

  return (
    <div className={`rounded-2xl border-2 ${border} bg-white overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-right ${head}`}
      >
        <Cloud className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-black text-sm">{service.name}</p>
          <p className="text-[11px] font-bold opacity-80 mt-0.5 leading-5">{service.bestFor}</p>
        </div>
        <ChevronDown
          className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 py-3 space-y-3 border-t border-slate-100">
          {service.site && (
            <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span className="dir-ltr">{service.site}</span>
            </p>
          )}
          <ol className="space-y-2 list-none counter-reset">
            {service.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-sm font-semibold text-slate-800 leading-7">
                <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center mt-0.5">
                  {(i + 1).toLocaleString('fa-IR')}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {service.tips?.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
              <p className="text-xs font-black text-amber-950 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                نکات امنیتی
              </p>
              {service.tips.map((t, i) => (
                <p key={i} className="text-[11px] font-bold text-amber-900 leading-5">
                  • {t}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const MIGRATE_PILLARS = [
  {
    title: '۱) کد برنامه (Frontend + API)',
    icon: Boxes,
    body: 'رابط کاربری React/Vite و توابع api/*.js — باید روی هاست Node یا Vercel/لیارا/PaaS شما دیپلوی شود.',
  },
  {
    title: '۲) دیتابیس و فایل‌ها (Supabase/Postgres)',
    icon: Database,
    body: 'ساکنین، قبوض، چت، رسیدها و Storage — یا همان پروژه Supabase را نگه می‌دارید یا به Postgres + Storage خودتان منتقل می‌کنید.',
  },
  {
    title: '۳) دامنه، HTTPS و متغیرهای محیطی',
    icon: Lock,
    body: 'آدرس عمومی (مثلاً app.yourdomain.com)، گواهی SSL، و کلیدهای SUPABASE / VITE در سرور جدید.',
  },
  {
    title: '۴) دادهٔ زنده و برش نهایی (Cutover)',
    icon: Rocket,
    body: 'Export داده → Import روی مقصد → تست ورود مدیر/ساکن → تعویض DNS و اعلام به کاربران.',
  },
]

const MIGRATE_PATHS = [
  {
    id: 'portable',
    name: 'نصب قابل‌حمل روی لیارا / پارس‌پک / VPS (بدون وابستگی به Vercel)',
    accent: 'emerald',
    summary:
      'برنامه با Nix اجرا می‌شود: Next.js + Zig API + PostgreSQL. دستور: ./run.sh',
    steps: [
      'کد پروژه را بگیرید (Git) — فایل .env را commit نکنید.',
      'از .env.example یک .env بسازید (Postgres محلی پیش‌فرض agon/agon).',
      'روی لینوکس / macOS / WSL: chmod +x run.sh && ./run.sh',
      'run.sh در صورت نیاز Nix 25.05 را نصب می‌کند، Postgres را راه می‌اندازد، سپس بک‌اند Zig و فرانت Next.js را اجرا می‌کند.',
      'سلامت: باز کردن /api/health باید ok برگرداند.',
      'Ctrl+C فرانت، بک‌اند و Postgres همین پروژه را متوقف می‌کند.',
      'دامنه + HTTPS در صورت نیاز با Nginx/Caddy روی پورت 3000.',
      'جزئیات کامل در فایل DEPLOY.md ریشه پروژه.',
    ],
  },
  {
    id: 'easy',
    name: 'مسیر آسان با Supabase مال خودتان + هر هاست Node',
    accent: 'sky',
    summary:
      'دیتابیس روی Supabase (طرح رایگان)، اجرای برنامه روی لیارا/VPS/Railway — نه فقط Vercel.',
    steps: [
      'پروژه Supabase خودتان بسازید؛ جداول و باکت‌های Storage (receipt-files، chat-voice) را منتقل/بسازید.',
      'کلیدها: URL، anon، service_role.',
      'کد را روی VPS با ./run.sh (Nix) دیپلوی کنید.',
      'متغیرهای محیطی را طبق جدول پایین ست کنید.',
      './run.sh را در لاگ موفق ببینید.',
      'دامنه را وصل کنید؛ PWA را دوباره نصب کنید.',
      'تست ورود مدیر/ساکن، قبض، رسید، اکسل.',
    ],
  },
  {
    id: 'full',
    name: 'مسیر کامل خودمیزبان (VPS شخصی / ابر خصوصی)',
    accent: 'violet',
    summary:
      'همه‌چیز روی سرور شما: Nix 25.05 + PostgreSQL + Zig + Next.js.',
    steps: [
      'VPS لینوکس بگیرید؛ ./run.sh را اجرا کنید (Nix را خودش نصب می‌کند).',
      'Ctrl+C همه سرویس‌های همین پروژه را متوقف می‌کند.',
      'بکاپ شبانه pg_dump به Object Storage (راهنمای فایل همین صفحه).',
      'فایروال فقط 80/443/22.',
      'مانیتور /api/health.',
    ],
  },
  {
    id: 'data',
    name: 'فقط انتقال داده',
    accent: 'sky',
    summary: 'اگر فعلاً فقط مالکیت داده را می‌خواهید.',
    steps: [
      'پشتیبان‌گیری از پنل مدیر بلوک + خروجی اکسل.',
      'Export جداول از Supabase و Storage.',
      'Import روی مقصد و تست موازی قبل از تعویض لینک.',
    ],
  },
]

const ENV_VARS = [
  {
    key: 'NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL',
    role: 'آدرس پروژه Supabase (یا Postgres API خودتان)',
  },
  {
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY',
    role: 'کلید عمومی کلاینت — در فرانت',
  },
  {
    key: 'SUPABASE_SERVICE_ROLE_KEY',
    role: 'کلید سرور — فقط در api/ و هرگز در فرانت/گیت',
  },
  {
    key: 'VITE_GOOGLE_CLIENT_ID (اختیاری)',
    role: 'اگر ورود با گوگل می‌خواهید؛ در غیر این صورت می‌توانید غیرفعال بماند',
  },
]

/**
 * راهنمای قدم‌به‌قدم انتقال فایل پشتیبان/اکسل به فضای ابری خصوصی
 * + انتقال و اجرای کل برنامه روی زیرساخت شخصی
 * — مخصوص پنل مدیر سیستم
 */
export default function CloudTransferGuide() {
  const [region, setRegion] = useState('ir') // ir | world
  const [guideTab, setGuideTab] = useState('files') // files | migrate
  const [openMigrate, setOpenMigrate] = useState('easy')

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/30">
          <CloudUpload className="w-6 h-6" />
        </div>
        <div>
          <h2 className="panel-title text-lg">ابر خصوصی و انتقال برنامه</h2>
          <p className="text-sm font-semibold text-slate-600 mt-1 leading-7">
            هم راهنمای نگهداری فایل پشتیبان روی ابر، هم مسیر کامل برای{' '}
            <strong>انتقال و اجرای کل سامانه</strong> روی فضای شخصی / سرور خودتان.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setGuideTab('files')}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-black inline-flex items-center justify-center gap-2 ${
            guideTab === 'files'
              ? 'border-sky-500 bg-sky-50 text-slate-600'
              : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          انتقال فایل پشتیبان
        </button>
        <button
          type="button"
          onClick={() => setGuideTab('migrate')}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-black inline-flex items-center justify-center gap-2 ${
            guideTab === 'migrate'
              ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
              : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          <Rocket className="w-4 h-4" />
          انتقال و اجرای کل برنامه
        </button>
      </div>

      {guideTab === 'migrate' && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-950 leading-7">
            <p className="font-black mb-1 flex items-center gap-1.5">
              <Rocket className="w-4 h-4" />
              این برنامه از چه بخش‌هایی ساخته شده؟
            </p>
            برای «قابل اجرا بودن در ابر شخصی» باید هر چهار لایه جابه‌جا یا دوباره وصل شوند — فقط آپلود
            پوشه روی Drive کافی نیست (Drive فایل را اجرا نمی‌کند).
          </div>

          <div className="grid sm:grid-cols-2 gap-2">
            {MIGRATE_PILLARS.map((p) => {
              const Icon = p.icon
              return (
                <div
                  key={p.title}
                  className="rounded-xl border border-indigo-100 bg-white px-3 py-2.5 flex gap-2"
                >
                  <Icon className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-indigo-950">{p.title}</p>
                    <p className="text-[11px] font-bold text-slate-700 leading-5 mt-0.5">{p.body}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-950 leading-6">
            <p className="font-black mb-1 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              اشتباه رایج
            </p>
            گذاشتن کل پروژه داخل Google Drive / MEGA فقط «بایگانی کد» است، نه اجرای آنلاین. برای اجرا
            به هاست Node/Serverless + دیتابیس نیاز دارید. فضای ابری فایل (همین تب «انتقال فایل») برای
            بکاپ است؛ «انتقال کل برنامه» مسیر جداست.
          </div>

          <div className="space-y-2">
            {MIGRATE_PATHS.map((path) => {
              const open = openMigrate === path.id
              const border =
                path.accent === 'emerald'
                  ? 'border-emerald-300'
                  : path.accent === 'violet'
                    ? 'border-violet-300'
                    : 'border-sky-300'
              const head =
                path.accent === 'emerald'
                  ? 'bg-emerald-50 text-emerald-950'
                  : path.accent === 'violet'
                    ? 'bg-violet-50 text-violet-950'
                    : 'bg-sky-50 text-sky-950'
              return (
                <div key={path.id} className={`rounded-2xl border-2 ${border} bg-white overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => setOpenMigrate((v) => (v === path.id ? '' : path.id))}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-right ${head}`}
                  >
                    <Terminal className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm">{path.name}</p>
                      <p className="text-[11px] font-bold opacity-80 mt-0.5 leading-5">{path.summary}</p>
                    </div>
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <ol className="px-4 py-3 space-y-2 border-t border-slate-100">
                      {path.steps.map((step, i) => (
                        <li
                          key={i}
                          className="flex gap-2.5 text-sm font-semibold text-slate-800 leading-7"
                        >
                          <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center mt-0.5">
                            {(i + 1).toLocaleString('fa-IR')}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )
            })}
          </div>

          <div className="panel-card rounded-2xl border-2 border-slate-200 p-4 space-y-2">
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <Copy className="w-4 h-4 text-slate-700" />
              متغیرهای محیطی که باید روی سرور جدید ست شوند
            </h3>
            <div className="space-y-2">
              {ENV_VARS.map((e) => (
                <div
                  key={e.key}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <p className="text-[11px] font-black text-slate-900 dir-ltr text-left">{e.key}</p>
                  <p className="text-[11px] font-bold text-slate-600 mt-0.5 leading-5">{e.role}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] font-bold text-rose-800 leading-5">
              service_role را فقط در محیط سرور بگذارید؛ داخل گیت، اسکرین‌شات، یا پیامک نفرستید. بعد از
              انتقال، کلیدهای قدیمی را در صورت نشت Rotate کنید.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 space-y-2">
            <p className="text-sm font-black text-emerald-950 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              حداقل تست قبل از اعلام به ساکنین
            </p>
            <ul className="text-xs font-bold text-emerald-900 leading-6 space-y-1">
              <li>• ورود مدیر سیستم / مدیر بلوک / یک ساکن نمونه</li>
              <li>• مشاهده قبض، ارسال رسید با تصویر، تأیید رسید</li>
              <li>• چت متنی/صوتی (اگر استفاده می‌کنید)</li>
              <li>• ورود از اکسل + پشتیبان/بازیابی</li>
              <li>• نصب PWA روی یک موبایل با آدرس جدید</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-700 leading-6">
            <p className="font-black text-slate-900 mb-1">پیشنهاد عملی برای شما</p>
            برنامه دیگر به Vercel قفل نیست. روی لینوکس / WSL با
            <span className="font-black"> ./run.sh </span>
            (Nix 25.05، بدون Docker) اجرا کنید. فایل
            DEPLOY.md در ریشه پروژه دستورهای کپی‌پیست دارد. بکاپ فایل را جداگانه در تب «انتقال فایل
            پشتیبان» نگه دارید.
          </div>

          <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-bold text-indigo-950 leading-6 space-y-1">
            <p className="font-black flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              سه دستور اصلی
            </p>
            <p className="dir-ltr text-left font-mono text-[11px] bg-white/80 rounded-lg px-2 py-1.5">
              chmod +x run.sh
            </p>
            <p className="dir-ltr text-left font-mono text-[11px] bg-white/80 rounded-lg px-2 py-1.5">
              ./run.sh
            </p>
            <p className="dir-ltr text-left font-mono text-[11px] bg-white/80 rounded-lg px-2 py-1.5">
              Ctrl+C
            </p>
            <p className="mt-1">سپس /api/health را برای اطمینان باز کنید.</p>
          </div>
        </div>
      )}

      {guideTab === 'files' && (
        <>

      <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-950 leading-7">
        <p className="font-black mb-1 flex items-center gap-1.5">
          <Shield className="w-4 h-4" />
          اصل امنیت
        </p>
        فایل پشتیبان شامل اطلاعات ساکنین و مالی است. فقط در فضای <strong>خصوصی</strong> با دسترسی
        محدود مدیران بگذارید. لینک «عمومی برای همه» نسازید. در صورت امکان روی فایل ZIP رمز بگذارید.
      </div>

      {/* App flow */}
      <div className="panel-card rounded-2xl border border-slate-200 p-4 space-y-3">
        <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-sky-700" />
          جریان پیشنهادی از داخل همین برنامه
        </h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {APP_FLOW.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2.5 flex gap-2"
              >
                <Icon className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black text-sky-950">{f.title}</p>
                  <p className="text-[11px] font-bold text-slate-600 leading-5 mt-0.5">{f.body}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Device checklist */}
      <div className="grid sm:grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-xs font-black text-slate-900 flex items-center gap-1.5 mb-1">
            <Monitor className="w-3.5 h-3.5" />
            رایانه
          </p>
          <p className="text-[11px] font-bold text-slate-600 leading-5">
            دانلود از برنامه → آپلود در وب‌پنل ابر یا پوشه Sync دسکتاپ.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-xs font-black text-slate-900 flex items-center gap-1.5 mb-1">
            <Smartphone className="w-3.5 h-3.5" />
            موبایل
          </p>
          <p className="text-[11px] font-bold text-slate-600 leading-5">
            پس از دانلود/اشتراک فایل، در اپ ابر «Upload» به پوشه خصوصی مدیران.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-xs font-black text-slate-900 flex items-center gap-1.5 mb-1">
            <Lock className="w-3.5 h-3.5" />
            رمز و دسترسی
          </p>
          <p className="text-[11px] font-bold text-slate-600 leading-5">
            ۲FA روی حساب ابر، رمز جدا برای ZIP، بدون لینک عمومی.
          </p>
        </div>
      </div>

      {/* Region toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRegion('ir')}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-black inline-flex items-center justify-center gap-2 ${
            region === 'ir'
              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          <Flag className="w-4 h-4" />
          سرویس‌های ایرانی
        </button>
        <button
          type="button"
          onClick={() => setRegion('world')}
          className={`rounded-xl border-2 px-3 py-3 text-sm font-black inline-flex items-center justify-center gap-2 ${
            region === 'world'
              ? 'border-violet-500 bg-violet-50 text-violet-900'
              : 'border-slate-200 bg-white text-slate-700'
          }`}
        >
          <Globe2 className="w-4 h-4" />
          سرویس‌های خارجی
        </button>
      </div>

      {region === 'ir' ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-xs font-bold text-emerald-950 leading-6">
            <p className="font-black mb-1 flex items-center gap-1">
              <Server className="w-3.5 h-3.5" />
              چرا ابر ایرانی؟
            </p>
            دسترسی پایدارتر از داخل کشور، پشتیبانی فارسی، و نگهداری داده نزدیک‌تر به محل. برای پشتیبان
            مالی مجتمع، Object Storage خصوصی (آروان / لیارا / پارس‌پک) معمولاً بهتر از درایو عمومی است.
          </div>
          {IR_SERVICES.map((s) => (
            <ServiceCard key={s.id} service={s} accent="emerald" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-xs font-bold text-violet-950 leading-6">
            <p className="font-black mb-1 flex items-center gap-1">
              <Globe2 className="w-3.5 h-3.5" />
              چرا ابر خارجی؟
            </p>
            همگام‌سازی قوی با موبایل/لپ‌تاپ، Version History خوب، و در سرویس‌هایی مثل MEGA رمزنگاری
            سمت کاربر. در صورت محدودیت دسترسی، از VPN قانونی سازمانی یا آینه/Sync روی سیستم مدیر
            استفاده کنید. مسئولیت رعایت قوانین محلی با بهره‌بردار است.
          </div>
          {WORLD_SERVICES.map((s) => (
            <ServiceCard key={s.id} service={s} accent="violet" />
          ))}
        </div>
      )}

      {/* Universal checklist */}
      <div className="panel-card rounded-2xl border-2 border-slate-200 p-4 space-y-2">
        <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          چک‌لیست نهایی بعد از هر پشتیبان‌گیری
        </h3>
        <ul className="space-y-1.5 text-sm font-semibold text-slate-800">
          {[
            'فایل روی دستگاه دانلود شده و حجم آن صفر نیست.',
            'نام فایل شامل تاریخ است.',
            'در ابر، داخل پوشه خصوصی مدیران قرار گرفته (نه چت عمومی).',
            'دسترسی Share فقط افراد مجاز است.',
            'یک‌بار از ابر دانلود آزمایشی و در صورت نیاز بازیابی تست شده است.',
            'رمز ZIP (اگر گذاشته‌اید) در جای امن غیرابری یادداشت شده است.',
            'نسخه هفته/ماه قبل هنوز موجود است (حذف عجولانه نکنید).',
          ].map((t) => (
            <li key={t} className="flex gap-2 leading-6">
              <span className="text-emerald-600 font-black">✓</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-bold text-slate-600 leading-5">
        <p className="flex items-center gap-1 font-black text-slate-800 mb-1">
          <KeyRound className="w-3.5 h-3.5" />
          قانون طلایی ۳-۲-۱
        </p>
        سه نسخه از داده مهم نگه دارید، روی دو نوع رسانه مختلف، و حداقل یک نسخه خارج از محل (مثلاً ابر
        + هارد در دفتر). این راهنما جایگزین سیاست امنیتی رسمی مجتمع نیست؛ آن را با هیئت‌مدیره هماهنگ
        کنید.
      </div>
        </>
      )}
    </div>
  )
}
