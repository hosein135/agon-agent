import { useEffect, useMemo, useState } from 'react'
import {
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock3,
  RefreshCw,
  Paperclip,
  X,
  Image as ImageIcon,
} from 'lucide-react'
import { isBillPending, isBillPaid } from '../lib/billStatus'
import type { AdminUser, ChangedHandler } from '../types'

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

function isDataImage(url) {
  return /^data:image\//i.test(String(url || ''))
}

function isPdfUrl(url) {
  const u = String(url || '')
  return /^data:application\/pdf/i.test(u) || /\.pdf(\?|$)/i.test(u)
}

function SafeReceiptPreview({ url, title = 'رسید' }) {
  const [open, setOpen] = useState(false)
  const [blobUrl, setBlobUrl] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  const openPreview = async () => {
    setErr('')
    try {
      if (!url) {
        setErr('فایل پیوست موجود نیست')
        return
      }
      // data URL خیلی بزرگ را به Blob تبدیل کن تا مرورگر کرش نکند
      if (isDataImage(url) || String(url).startsWith('data:')) {
        const res = await fetch(url)
        const blob = await res.blob()
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        const next = URL.createObjectURL(blob)
        setBlobUrl(next)
        setOpen(true)
        return
      }
      if (isHttpUrl(url)) {
        setBlobUrl(url)
        setOpen(true)
        return
      }
      setErr('فرمت پیوست پشتیبانی نمی‌شود')
    } catch (e) {
      setErr(e.message || 'خطا در نمایش رسید')
    }
  }

  const close = () => {
    setOpen(false)
    if (blobUrl && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl)
      setBlobUrl('')
    }
  }

  if (!url) {
    return <span className="text-rose-600 text-xs font-bold">بدون پیوست</span>
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={openPreview}
        className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black px-3 py-2"
      >
        <Paperclip className="w-3.5 h-3.5" />
        مشاهده رسید
      </button>
      {err && <p className="text-[11px] font-bold text-rose-600">{err}</p>}

      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-3"
          onClick={close}
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
                <span className="text-sm font-black text-slate-800 truncate">{title}</span>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-2 rounded-lg hover:bg-slate-200 text-slate-700"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 overflow-auto max-h-[calc(90vh-56px)] bg-slate-100">
              {isPdfUrl(url) ? (
                <iframe title={title} src={blobUrl || url} className="w-full h-[70vh] rounded-xl bg-white" />
              ) : (
                <img
                  src={blobUrl || url}
                  alt={title}
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

export default function ManagerReceipts({
  admin,
  onChanged,
}: {
  admin: AdminUser
  onChanged?: ChangedHandler
}) {
  const [pendingBills, setPendingBills] = useState<any[]>([])
  const [approvedBills, setApprovedBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [rejectModal, setRejectModal] = useState(null) // bill object
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState('')

  const load = async ({ silent = false } = {}) => {
    if (!silent) {
      setError('')
      setLoading(true)
    }
    try {
      const q = new URLSearchParams()
      if (admin?.block_number) q.set('block_number', admin.block_number)
      if (admin?.block_direction) q.set('block_direction', admin.block_direction)

      const bRes = await fetch(`/api/bills?${q.toString()}`)
      const bData = await bRes.json().catch(() => [])
      if (!bRes.ok) throw new Error(bData?.error || 'خطا در دریافت رسیدها')

      const bills = Array.isArray(bData) ? bData : []

      const withReceipt = bills.filter((b) => {
        const pending = isBillPending(b.status)
        const paidWithReceipt = isBillPaid(b.status) && (b.attachment_url || b.has_receipt)
        return pending || paidWithReceipt
      })

      setPendingBills(withReceipt.filter((b) => isBillPending(b.status)))
      setApprovedBills(withReceipt.filter((b) => isBillPaid(b.status)))
    } catch (err) {
      if (!silent) {
        setError(err.message || 'خطا')
        setPendingBills([])
        setApprovedBills([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load({ silent: false })
    const t = setInterval(() => load({ silent: true }), 25000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.block_number, admin?.block_direction])

  const openRejectModal = (bill) => {
    setRejectModal(bill)
    setRejectReason('')
    setRejectError('')
  }

  const closeRejectModal = () => {
    if (busyId) return
    setRejectModal(null)
    setRejectReason('')
    setRejectError('')
  }

  const decide = async (bill, decision, reason = '') => {
    const label = decision === 'approve' ? 'تایید' : 'رد'
    if (decision === 'approve') {
      if (!confirm(`آیا از تایید رسید واحد ${bill.unit_name} مطمئن هستید؟`)) return
    } else {
      const r = String(reason || '').trim()
      if (r.length < 3) {
        setRejectError('علت رد را بنویسید (حداقل ۳ کاراکتر)')
        return
      }
      if (r.length > 500) {
        setRejectError('علت رد حداکثر ۵۰۰ کاراکتر باشد')
        return
      }
    }

    setBusyId(bill.id)
    setError('')
    setSuccess('')
    setRejectError('')
    try {
      const res = await fetch('/api/bills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_receipt',
          id: bill.id,
          decision,
          reviewed_by: admin.full_name || 'مدیر بلوک',
          ...(decision === 'reject' ? { reject_reason: String(reason).trim() } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `${label} ناموفق بود`)
      setSuccess(
        decision === 'approve'
          ? 'رسید تایید شد و قبض سبز گردید.'
          : 'رسید رد شد و علت برای ساکن ارسال شد.',
      )
      setRejectModal(null)
      setRejectReason('')
      await load({ silent: true })
      onChanged?.()
    } catch (err) {
      if (decision === 'reject') setRejectError(err.message)
      else setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const money = (n) => `${Number(n || 0).toLocaleString('fa-IR')} تومان`
  const formatDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('fa-IR')
    } catch {
      return iso
    }
  }

  const pendingCount = useMemo(() => pendingBills.length, [pendingBills])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-5 h-5 text-emerald-600" />
          <h2 className="panel-title text-lg">رسید دریافتی از ساکنین</h2>
        </div>
        <button
          type="button"
          onClick={() => load({ silent: false })}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-800 hover:text-sky-950"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
        </button>
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="msg-success flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* فقط رسیدهای در انتظار */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock3 className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-black text-sky-950">
            در انتظار تایید
            {pendingCount > 0 && (
              <span className="ms-2 inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px]">
                {pendingCount.toLocaleString('fa-IR')}
              </span>
            )}
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-9 h-9 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : pendingBills.length === 0 ? (
          <div className="panel-card rounded-2xl p-10 text-center text-sky-800 font-semibold text-sm">
            هنوز رسیدی از ساکنین دریافت نشده است
          </div>
        ) : (
          <div className="space-y-3">
            {pendingBills.map((b) => (
              <div
                key={b.id}
                className="panel-card rounded-2xl p-4 border-2 border-amber-300 bg-amber-50/40 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-800">واحد {b.unit_name}</p>
                    <h4 className="font-extrabold text-slate-900 text-base">{b.title}</h4>
                    <p className="text-sm font-black text-rose-700 mt-1">{money(b.amount)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-black text-amber-900 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
                    <Clock3 className="w-3 h-3" />
                    در انتظار تایید
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-700">
                  <div>
                    <span className="text-slate-500 block">ارسال‌کننده</span>
                    {b.receipt_by || 'ساکن'}
                  </div>
                  <div>
                    <span className="text-slate-500 block">زمان ارسال</span>
                    {formatDate(b.receipt_at || b.paid_at)}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1.5">رسید پیوست‌شده</span>
                  <SafeReceiptPreview url={b.attachment_url} title={`رسید ${b.title} — واحد ${b.unit_name}`} />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => decide(b, 'approve')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    تایید (سبز شدن قبض)
                  </button>
                  <button
                    type="button"
                    disabled={busyId === b.id}
                    onClick={() => openRejectModal(b)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm py-2.5 disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4" />
                    رد
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* مودال علت رد رسید */}
      {rejectModal && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-3"
          role="dialog"
          aria-modal="true"
          onClick={closeRejectModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-rose-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-rose-50 border-b border-rose-200">
              <div className="min-w-0">
                <p className="text-sm font-black text-rose-900">علت رد رسید</p>
                <p className="text-xs font-bold text-rose-700 truncate">
                  واحد {rejectModal.unit_name} — {rejectModal.title}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRejectModal}
                className="p-2 rounded-lg hover:bg-rose-100 text-rose-800"
                aria-label="بستن"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-600 leading-6">
                دلیل رد را بنویسید تا ساکن ببیند و در صورت نیاز دوباره رسید بفرستد.
              </p>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">علت رد *</span>
                <textarea
                  className="field-input min-h-[110px] resize-y"
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value)
                    setRejectError('')
                  }}
                  placeholder="مثلاً: مبلغ واریزی با مبلغ قبض مطابقت ندارد / تصویر ناخوانا است / ..."
                  maxLength={500}
                  autoFocus
                />
                <span className="mt-1 block text-[11px] font-bold text-slate-500">
                  {rejectReason.trim().length.toLocaleString('fa-IR')} / ۵۰۰
                </span>
              </label>
              {rejectError && (
                <div className="msg-error rounded-xl px-3 py-2 text-xs font-bold">{rejectError}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyId === rejectModal.id}
                  onClick={() => decide(rejectModal, 'reject', rejectReason)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm py-2.5 disabled:opacity-60"
                >
                  <XCircle className="w-4 h-4" />
                  {busyId === rejectModal.id ? 'در حال ثبت...' : 'ثبت رد رسید'}
                </button>
                <button
                  type="button"
                  disabled={busyId === rejectModal.id}
                  onClick={closeRejectModal}
                  className="flex-1 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-sm py-2.5 hover:bg-slate-50 disabled:opacity-60"
                >
                  انصراف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* رسیدهای تایید شده */}
      {approvedBills.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-black text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            تایید شده
          </h3>
          <div className="space-y-2">
            {approvedBills.map((b) => (
              <div
                key={`ok-${b.id}`}
                className="panel-card rounded-2xl p-4 border-2 border-emerald-300 bg-emerald-50/40 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-800">واحد {b.unit_name}</p>
                  <h4 className="font-extrabold text-slate-900">{b.title}</h4>
                  <p className="text-sm font-black text-emerald-700 mt-0.5">{money(b.amount)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="receipt-confirm is-yes">تایید شده</span>
                  <SafeReceiptPreview url={b.attachment_url} title={`رسید ${b.title}`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
