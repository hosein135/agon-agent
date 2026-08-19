'use client'

import { useEffect, useState } from 'react'
import { useNavigate } from '../lib/nav'
import { Receipt, AlertCircle, Loader2, Share2, ShoppingCart } from 'lucide-react'
import { getSession } from '../lib/session'
import { setPendingSharePayload } from '../lib/shareTarget'

/**
 * مقصد Web Share Target از اپ‌های پرداخت:
 * - ساکن → بخش رسید
 * - مدیر بلوک → خرج‌کرد بلوک (پیوست به فاکتور)
 * - سایر → ورود با next مناسب
 */
export default function ShareTargetPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [status, setStatus] = useState('در حال دریافت فایل اشتراک‌گذاری‌شده...')

  useEffect(() => {
    let cancelled = false

    const routeAfterShare = () => {
      const session = getSession()
      if (session?.type === 'resident') {
        navigate('/panel?tab=bills&share=1', { replace: true })
        return
      }
      if (session?.type === 'admin' && session.admin?.role === 'block_manager') {
        navigate('/block-admin?tab=block_expenses&share=1', { replace: true })
        return
      }
      // انتخاب مقصد در صفحه ورود / یا ورود مدیر
      navigate('/?next=share-choose', { replace: true })
    }

    const run = async () => {
      try {
        let payload = null

        if ('serviceWorker' in navigator) {
          try {
            const reg = await navigator.serviceWorker.ready
            const sw = reg.active || navigator.serviceWorker.controller
            if (sw) {
              payload = await new Promise((resolve) => {
                const channel = new MessageChannel()
                const timer = setTimeout(() => resolve(null), 4000)
                channel.port1.onmessage = (event) => {
                  clearTimeout(timer)
                  resolve(event.data || null)
                }
                sw.postMessage({ type: 'GET_SHARE_TARGET' }, [channel.port2])
              })
            }
          } catch {
            /* ignore */
          }
        }

        if (!payload) {
          const params = new URLSearchParams(window.location.search)
          const title = params.get('title') || ''
          const text = params.get('text') || ''
          const url = params.get('url') || ''
          if (title || text || url) {
            payload = {
              title,
              text,
              url,
              fileDataUrl: '',
              fileName: '',
              fileType: '',
              receivedAt: new Date().toISOString(),
              source: 'query',
            }
          }
        }

        if (cancelled) return

        if (!payload || (!payload.fileDataUrl && !payload.text && !payload.url && !payload.title)) {
          setError(
            'فایل یا متنی از اشتراک‌گذاری دریافت نشد. از اپ پرداخت، تصویر را با «اشتراک‌گذاری» به «بلوک هفت شرقی» بفرستید.',
          )
          setStatus('')
          return
        }

        setStatus('در حال آماده‌سازی فایل...')
        await setPendingSharePayload(payload)
        if (cancelled) return

        const session = getSession()
        if (session?.type === 'admin' && session.admin?.role === 'block_manager') {
          setStatus('فایل دریافت شد. در حال باز کردن خرج‌کرد بلوک...')
        } else if (session?.type === 'resident') {
          setStatus('فایل دریافت شد. در حال باز کردن بخش رسید...')
        } else {
          setStatus('فایل دریافت شد. در حال هدایت...')
        }
        routeAfterShare()
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'خطا در پردازش اشتراک‌گذاری')
          setStatus('')
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="min-h-screen panel-page flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md panel-card rounded-3xl p-6 space-y-4 text-center bg-white/95">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
          <Share2 className="w-7 h-7 text-indigo-700" />
        </div>
        <h1 className="text-lg font-black text-slate-900">اشتراک‌گذاری از اپ پرداخت</h1>
        <p className="text-xs font-bold text-slate-600 leading-6">
          رسید ساکن یا فاکتور خرج‌کرد مدیر — بر اساس نوع ورود هدایت می‌شود
        </p>

        {status && (
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            {status}
          </div>
        )}

        {error && (
          <div className="msg-error rounded-xl px-4 py-3 text-sm font-semibold text-right flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {error && (
          <div className="grid gap-2">
            <button
              type="button"
              className="btn-primary !mt-0 inline-flex items-center justify-center gap-2 w-full"
              onClick={() => {
                const session = getSession()
                if (session?.type === 'resident') navigate('/panel?tab=bills', { replace: true })
                else if (session?.type === 'admin' && session.admin?.role === 'block_manager') {
                  navigate('/block-admin?tab=block_expenses', { replace: true })
                } else navigate('/', { replace: true })
              }}
            >
              <Receipt className="w-4 h-4" />
              رفتن به برنامه
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
