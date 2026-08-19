import { useState } from 'react'
import { Link2, Copy, Check, Share2, ExternalLink } from 'lucide-react'

export default function AppLinkTab() {
  const [copied, setCopied] = useState(false)
  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const registerUrl = `${appUrl}/`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(registerUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement('textarea')
      el.value = registerUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'بلوک هفت شرقی',
          text: 'لینک ورود و ثبت‌نام سامانه بلوک هفت شرقی',
          url: registerUrl,
        })
      } catch {
        /* cancelled */
      }
    } else {
      copy()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-black shrink-0">
          <img src="/app-logo.jpg" alt="لوگو" className="w-full h-full object-cover" width={48} height={48} />
        </div>
        <div className="flex items-center gap-2">
          <Link2 className="w-5 h-5 text-indigo-600" />
          <h2 className="panel-title text-lg">لینک برنامه</h2>
        </div>
      </div>
      <p className="text-sm text-slate-600 font-semibold">
        این لینک را برای ساکنین یا مدیران بفرستید تا وارد سامانه شوند، ثبت‌نام کنند و در صورت نیاز برنامه را نصب کنند.
      </p>

      <div className="panel-card rounded-2xl p-5 space-y-4">
        <div>
          <p className="field-label text-xs mb-1.5">آدرس برنامه</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 field-input dir-ltr break-all !py-3 font-bold text-slate-800 bg-slate-50">
              {registerUrl || '—'}
            </div>
            <button
              type="button"
              onClick={copy}
              className="btn-primary !w-auto !mt-0 !px-4 !py-3 inline-flex items-center justify-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'کپی شد' : 'کپی لینک'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={share}
            className="btn-ghost inline-flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            اشتراک‌گذاری
          </button>
          <a
            href={registerUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost inline-flex items-center gap-2 no-underline"
          >
            <ExternalLink className="w-4 h-4" />
            باز کردن لینک
          </a>
        </div>

        <div className="hint-box">
          مسیر پیشنهادی: باز کردن لینک → ثبت‌نام / ورود ساکنین → از تب «نصب برنامه» روی گوشی یا رایانه نصب کنید.
        </div>
      </div>
    </div>
  )
}
