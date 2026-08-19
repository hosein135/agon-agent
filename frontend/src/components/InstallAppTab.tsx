import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Share,
  PlusSquare,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { getPwaState, promptInstall, subscribePwa } from '../lib/pwa'

function detectPlatform() {
  const ua = navigator.userAgent || ''
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua)
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua)
  const isChrome = /Chrome|CriOS|Edg|OPR/i.test(ua)
  return { isIOS, isAndroid, isMobile, isDesktop: !isMobile, isSafari, isChrome }
}

export default function InstallAppTab() {
  const [state, setState] = useState(() => getPwaState())
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const platform = useMemo(() => detectPlatform(), [])
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  useEffect(() => {
    return subscribePwa(setState)
  }, [])

  const install = async () => {
    setMsg('')
    setBusy(true)
    try {
      if (state.inIframe) {
        setMsg('نصب داخل پیش‌نمایش ممکن نیست. ابتدا «باز کردن در تب جدید» را بزنید، بعد نصب کنید.')
        return
      }
      if (!state.secure) {
        setMsg('نصب فقط روی آدرس امن (HTTPS) ممکن است.')
        return
      }
      if (!state.swReady) {
        setMsg('Service Worker هنوز آماده نیست. چند ثانیه صبر کنید و دوباره تلاش کنید.')
        // try refresh SW
        if ('serviceWorker' in navigator) {
          try {
            await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
          } catch (_) {}
        }
        return
      }

      const result = await promptInstall()
      if (result.ok) {
        setMsg('نصب با موفقیت انجام شد (یا در حال تکمیل است).')
        return
      }
      if (result.reason === 'no-prompt') {
        if (platform.isIOS) {
          setMsg('در iPhone/iPad: دکمه Share → Add to Home Screen را بزنید.')
        } else if (platform.isAndroid) {
          setMsg('در Chrome موبایل: منوی ⋮ → Install app / افزودن به صفحه اصلی')
        } else {
          setMsg(
            'دکمه نصب مرورگر هنوز فعال نشده. صفحه را یک‌بار رفرش کنید، چند ثانیه بمانید، سپس از آیکون ⊕ نوار آدرس یا منوی مرورگر Install app را بزنید.',
          )
        }
        return
      }
      setMsg('نصب لغو شد.')
    } finally {
      setBusy(false)
    }
  }

  const openStandaloneTab = () => {
    window.open(appUrl + '/?source=pwa', '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-slate-200 shadow-lg shadow-slate-900/10 bg-black shrink-0">
          <img
            src="/app-logo.jpg"
            alt="لوگوی برنامه"
            className="w-full h-full object-cover"
            width={56}
            height={56}
            loading="eager"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-600" />
            <h2 className="panel-title text-lg">نصب برنامه</h2>
          </div>
          <p className="text-sm text-slate-500 font-semibold mt-0.5">
            بلوک هفت شرقی — نصب روی موبایل و رایانه
          </p>
        </div>
      </div>
      <p className="text-sm text-slate-600 font-semibold">
        برنامه به‌صورت PWA با لوگوی اختصاصی نصب می‌شود (مثل اپ واقعی).
      </p>

      {state.inIframe && (
        <div className="msg-error flex flex-col gap-3 rounded-xl px-4 py-3 text-sm font-semibold">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              الان داخل پیش‌نمایش/iframe هستید. مرورگر اجازه نصب PWA را در iframe نمی‌دهد.
            </span>
          </div>
          <button
            type="button"
            onClick={openStandaloneTab}
            className="btn-admin !mt-0 !py-2.5 inline-flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            باز کردن در تب جدید برای نصب
          </button>
        </div>
      )}

      {state.installed ? (
        <div className="msg-success flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          برنامه روی این دستگاه نصب است و در حالت اپ اجرا می‌شود.
        </div>
      ) : (
        <div className="panel-card rounded-2xl p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 font-extrabold text-slate-900 mb-2">
                <Smartphone className="w-5 h-5 text-indigo-600" />
                تلفن همراه
              </div>
              {platform.isIOS ? (
                <ol className="text-xs font-semibold text-slate-800 space-y-1.5 leading-6 list-decimal pr-4">
                  <li>سایت را در Safari (نه داخل پیش‌نمایش) باز کنید.</li>
                  <li>
                    دکمه <Share className="w-3.5 h-3.5 inline" /> Share را بزنید.
                  </li>
                  <li>
                    <PlusSquare className="w-3.5 h-3.5 inline" /> Add to Home Screen
                  </li>
                  <li>Add را بزنید.</li>
                </ol>
              ) : (
                <ol className="text-xs font-semibold text-slate-800 space-y-1.5 leading-6 list-decimal pr-4">
                  <li>در Chrome لینک را در تب کامل باز کنید.</li>
                  <li>وارد حساب شوید.</li>
                  <li>دکمه «نصب روی این دستگاه» را بزنید.</li>
                  <li>یا منوی ⋮ ← Install app</li>
                </ol>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 font-extrabold text-slate-900 mb-2">
                <Monitor className="w-5 h-5 text-indigo-600" />
                رایانه
              </div>
              <ol className="text-xs font-semibold text-slate-800 space-y-1.5 leading-6 list-decimal pr-4">
                <li>Chrome یا Edge را باز کنید (تب کامل، نه iframe).</li>
                <li>آیکون نصب در سمت راست نوار آدرس را بزنید.</li>
                <li>یا از منوی مرورگر Install بلوک هفت شرقی</li>
              </ol>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={install}
              disabled={busy || state.installed || state.inIframe}
              className="btn-admin !mt-0 inline-flex items-center justify-center gap-2 flex-1 disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              {state.canInstall ? 'نصب روی این دستگاه' : 'بررسی / تلاش برای نصب'}
            </button>
            <button
              type="button"
              onClick={openStandaloneTab}
              className="btn-ghost inline-flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              باز کردن تب کامل
            </button>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 space-y-1">
            <p className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Service Worker: {state.swReady ? 'فعال ✓' : 'غیرفعال / در حال ثبت...'}
            </p>
            <p>HTTPS: {state.secure ? 'بله ✓' : 'خیر ✗'}</p>
            <p>
              آماده نصب مرورگر: {state.canInstall ? 'بله ✓ (دکمه نصب فعال است)' : 'هنوز نه — راهنما را دنبال کنید'}
            </p>
            <p>
              دستگاه:{' '}
              {platform.isIOS
                ? 'iOS'
                : platform.isAndroid
                  ? 'Android'
                  : platform.isDesktop
                    ? 'رایانه'
                    : 'موبایل'}
            </p>
          </div>
        </div>
      )}

      {msg && (
        <div className="hint-box flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{msg}</span>
        </div>
      )}
    </div>
  )
}
