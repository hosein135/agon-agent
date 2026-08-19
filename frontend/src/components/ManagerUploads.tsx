import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Images,
  Mic,
  Paperclip,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import type { AdminUser } from '../types'

const KIND_LABELS = {
  receipt: 'رسید پرداخت',
  expense: 'فاکتور خرج‌کرد',
  voice: 'پیام صوتی',
  file: 'فایل',
}

const KIND_FILTERS = [
  { id: '', label: 'همه' },
  { id: 'receipt', label: 'رسید' },
  { id: 'expense', label: 'فاکتور' },
  { id: 'voice', label: 'صوت' },
]

function formatBytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v.toLocaleString('fa-IR')} بایت`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fa-IR')
  } catch {
    return String(iso)
  }
}

function daysLeft(expiresAt, createdAt) {
  const end = expiresAt || (createdAt ? new Date(createdAt).getTime() + 60 * 24 * 60 * 60 * 1000 : 0)
  const ts = typeof end === 'number' ? end : new Date(end).getTime()
  if (!ts) return 0
  return Math.max(0, Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000)))
}

function isPdf(item) {
  const ct = String(item?.content_type || '')
  const name = String(item?.original_name || item?.public_id || '')
  return ct.includes('pdf') || /\.pdf$/i.test(name)
}

function isAudio(item) {
  const ct = String(item?.content_type || '')
  const kind = String(item?.kind || '')
  const name = String(item?.original_name || item?.public_id || '')
  return kind === 'voice' || ct.startsWith('audio/') || /\.webm$/i.test(name)
}

function KindIcon({ kind }) {
  if (kind === 'voice') return <Mic className="w-5 h-5 text-white" />
  if (kind === 'expense') return <FileText className="w-5 h-5 text-white" />
  if (kind === 'receipt') return <ImageIcon className="w-5 h-5 text-white" />
  return <Paperclip className="w-5 h-5 text-white" />
}

export default function ManagerUploads({
  admin,
  scope = 'block',
}: {
  admin?: AdminUser | null
  scope?: 'block' | 'all'
}) {
  const [items, setItems] = useState<any[]>([])
  const [stats, setStats] = useState({ count: 0, bytes: 0 })
  const [kind, setKind] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [preview, setPreview] = useState(null)
  const [blobUrl, setBlobUrl] = useState('')

  const q = useMemo(() => {
    const params = new URLSearchParams()
    if (scope === 'block') {
      if (admin?.block_number) params.set('block_number', String(admin.block_number))
      if (admin?.block_direction) params.set('block_direction', String(admin.block_direction))
    }
    if (kind) params.set('kind', kind)
    return params.toString()
  }, [admin?.block_number, admin?.block_direction, kind, scope])

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true)
        setError('')
      }
      try {
        const res = await fetch(`/api/uploads${q ? `?${q}` : ''}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'خطا در دریافت فایل‌ها')
        setItems(Array.isArray(data.items) ? data.items : [])
        setStats({
          count: Number(data.stats?.count) || 0,
          bytes: Number(data.stats?.bytes) || 0,
        })
      } catch (err) {
        if (!silent) {
          setError(err.message || 'خطا')
          setItems([])
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [q],
  )

  useEffect(() => {
    load({ silent: false })
    const t = setInterval(() => load({ silent: true }), 30000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const openPreview = async (item) => {
    setError('')
    try {
      const url = item.url || (item.public_id ? `/uploads/${item.public_id}` : '')
      if (!url) throw new Error('آدرس فایل موجود نیست')
      const res = await fetch(url)
      if (!res.ok) throw new Error('فایل پیدا نشد — ممکن است منقضی شده باشد')
      const blob = await res.blob()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      setBlobUrl(URL.createObjectURL(blob))
      setPreview(item)
    } catch (err) {
      setError(err.message || 'نمایش فایل ناموفق بود')
    }
  }

  const closePreview = () => {
    setPreview(null)
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      setBlobUrl('')
    }
  }

  const removeItem = async (item) => {
    if (!confirm('این فایل از پایگاه داده حذف شود؟')) return
    setBusyId(item.id)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/uploads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, public_id: item.public_id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'حذف ناموفق بود')
      setSuccess('فایل حذف شد')
      if (preview?.id === item.id) closePreview()
      await load({ silent: true })
    } catch (err) {
      setError(err.message || 'حذف ناموفق بود')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3" dir="rtl">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-800 flex items-center justify-center shrink-0">
            <Images className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-900">فایل‌های آپلود شده</p>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              رسید، فاکتور و پیام صوتی در پایگاه داده ذخیره می‌شود و پس از ۶۰ روز خودکار حذف می‌گردد.
            </p>
            <p className="text-[11px] font-bold text-indigo-800 mt-2">
              {Number(stats.count || 0).toLocaleString('fa-IR')} فایل — {formatBytes(stats.bytes)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => load({ silent: false })}
            className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shrink-0"
            aria-label="بازخوانی"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            type="button"
            onClick={() => setKind(f.id)}
            className={`text-xs font-black rounded-full px-3 py-1.5 border ${
              kind === f.id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-500 font-semibold text-sm">
          فایلی برای نمایش نیست.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const left = daysLeft(item.expires_at, item.created_at)
            return (
              <div
                key={item.id || item.public_id}
                className="rounded-2xl border border-slate-200 bg-white px-3.5 py-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-900 flex items-center justify-center shrink-0">
                    <KindIcon kind={item.kind} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900 truncate">
                      {item.original_name || item.public_id}
                    </p>
                    <p className="text-xs font-bold text-indigo-800 mt-0.5">
                      {KIND_LABELS[item.kind] || KIND_LABELS.file}
                      {item.unit_name ? ` — واحد ${item.unit_name}` : ''}
                      {item.block_number
                        ? ` — بلوک ${item.block_number} ${item.block_direction || ''}`
                        : ''}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-600 mt-1">
                      {formatDate(item.created_at)} — {formatBytes(item.byte_size)} — باقی‌مانده{' '}
                      {left.toLocaleString('fa-IR')} روز
                    </p>
                    {item.created_by ? (
                      <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                        توسط {item.created_by}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => openPreview(item)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black px-3 py-2"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        مشاهده
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => removeItem(item)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-black px-3 py-2 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {preview && blobUrl && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-3"
          onClick={closePreview}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-lg max-h-[90vh] rounded-2xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-sky-700 shrink-0" />
                <span className="text-sm font-black text-slate-800 truncate">
                  {preview.original_name || preview.public_id}
                </span>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="p-2 rounded-lg hover:bg-slate-200 text-slate-700"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 overflow-auto max-h-[calc(90vh-56px)] bg-slate-100">
              {isAudio(preview) ? (
                <audio controls src={blobUrl} className="w-full" />
              ) : isPdf(preview) ? (
                <iframe
                  title={preview.original_name || 'فایل'}
                  src={blobUrl}
                  className="w-full h-[70vh] rounded-xl bg-white"
                />
              ) : (
                <img
                  src={blobUrl}
                  alt={preview.original_name || 'فایل'}
                  className="w-full h-auto max-h-[75vh] object-contain rounded-xl bg-white mx-auto"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
