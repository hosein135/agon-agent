import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Receipt,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShoppingCart,
  FileText,
  CalendarDays,
  Paperclip,
  Image as ImageIcon,
  X,
  Link2,
} from 'lucide-react'
import { toEnglishDigits } from '../lib/digits'
import { amountToPersianTomanLabel } from '../lib/numberWords'
import { prepareReceiptFile } from '../lib/receiptFile'
import {
  clearPendingSharePayload,
  clearSelectedExpenseForShare,
  dataUrlToFile,
  getPendingSharePayload,
  getSelectedExpenseForShare,
  hasPendingSharePayload,
  setSelectedExpenseForShare,
} from '../lib/shareTarget'
import type { AdminUser, ChangedHandler } from '../types'

const EXPENSE_TITLES = ['قبض برق', 'قبض آب', 'تعمیرات', 'سایر']

function money(n) {
  return `${Number(n || 0).toLocaleString('fa-IR')} تومان`
}

function emptyLine() {
  return { title: 'قبض برق', other_type: '', amount: '', description: '' }
}

function todayInputValue() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatFaDateOnly(isoOrYmd) {
  if (!isoOrYmd) return '—'
  try {
    const s = String(isoOrYmd)
    const d = s.length <= 10 ? new Date(`${s}T12:00:00`) : new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return String(isoOrYmd)
  }
}

function formatDateTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/**
 * خرج‌کرد بلوک — فاکتور چندردیفه + تاریخ + پیوست + اشتراک‌گذاری از اپ پرداخت
 */
export default function BlockExpenses({
  admin,
  onChanged,
  shareMode = false,
  onShareConsumed,
}: {
  admin: AdminUser
  onChanged?: ChangedHandler
  shareMode?: boolean
  onShareConsumed?: ChangedHandler
}) {
  const [lines, setLines] = useState([emptyLine()])
  const [note, setNote] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => todayInputValue())
  const [dateAuto, setDateAuto] = useState(true)
  const [attachFile, setAttachFile] = useState(null)
  const [attachPreview, setAttachPreview] = useState('')
  const fileRef = useRef(null)
  const shareAppliedRef = useRef(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [laterFileById, setLaterFileById] = useState({})
  const [shareInfo, setShareInfo] = useState(null)
  /** انتخاب مقصد فایل share: 'new' | id فاکتور بدون پیوست */
  const [shareTargetChoice, setShareTargetChoice] = useState('new')
  const laterRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    if (!admin?.block_number) return
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams({
        block_number: admin.block_number,
        block_direction: admin.block_direction || '',
      })
      const res = await fetch(`/api/block-expenses?${q.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت خرج‌کردها')
      setInvoices(Array.isArray(data.invoices) ? data.invoices : [])
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }, [admin?.block_number, admin?.block_direction])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return () => {
      if (attachPreview) URL.revokeObjectURL(attachPreview)
    }
  }, [attachPreview])

  const totalDraft = useMemo(() => {
    return lines.reduce((s, l) => {
      const n = Number(toEnglishDigits(l.amount).replace(/[^\d.]/g, ''))
      return s + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [lines])

  const setLine = (idx, patch) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (idx) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  const pickAttach = (file) => {
    setError('')
    if (!file) return
    const ok =
      !file.type ||
      file.type.startsWith('image/') ||
      file.type === 'application/pdf' ||
      /\.(jpe?g|png|webp|gif|pdf)$/i.test(file.name || '')
    if (!ok) {
      setError('فقط تصویر یا PDF برای پیوست مجاز است')
      return
    }
    setAttachFile(file)
    if (file.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(file.name || '')) {
      const url = URL.createObjectURL(file)
      setAttachPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } else {
      setAttachPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return ''
      })
    }
  }

  // فقط آماده‌سازی فایل share — مقصد را کاربر انتخاب می‌کند
  useEffect(() => {
    if (shareAppliedRef.current) return
    if (!shareMode && !hasPendingSharePayload()) return
    if (loading) return

    const apply = async () => {
      const payload = getPendingSharePayload()
      if (!payload) {
        if (shareMode) {
          setError(
            'فایل اشتراک‌گذاری‌شده پیدا نشد. دوباره از اپ پرداخت تصویر را با «اشتراک‌گذاری» به بلوک هفت شرقی بفرستید.',
          )
          onShareConsumed?.()
        }
        return
      }
      shareAppliedRef.current = true

      try {
        let file = null
        if (payload.fileDataUrl) {
          file = await dataUrlToFile(
            payload.fileDataUrl,
            payload.fileName || `expense-share-${Date.now()}.jpg`,
          )
        }

        const noteParts: string[] = []
        if (payload.title) noteParts.push(String(payload.title))
        if (payload.text) noteParts.push(String(payload.text))
        if (payload.url) noteParts.push(String(payload.url))
        const sharedNote = noteParts.filter(Boolean).join(' | ').slice(0, 400)

        if (file) {
          pickAttach(file)
          if (sharedNote) {
            setNote((prev) => (prev ? `${prev}\n${sharedNote}` : sharedNote))
          }

          // پیش‌فرض: فاکتور جدید — مگر id از قبل انتخاب شده و بدون پیوست باشد
          const preferredId = getSelectedExpenseForShare()
          const preferred = preferredId
            ? invoices.find((x) => Number(x.id) === Number(preferredId))
            : null
          const preferredOk = preferred && !String(preferred.attachment_url || '').trim()

          setShareInfo({
            mode: preferredOk ? 'pick' : 'pick',
            fileName: file.name,
            hasFile: true,
            file,
            sharedNote,
          })
          setShareTargetChoice(preferredOk ? String(preferred.id) : 'new')
          if (preferredOk) {
            setLaterFileById((p) => ({ ...p, [preferred.id]: file }))
            setExpandedId(preferred.id)
          }
          setSuccess(
            `فایل «${file.name}» از اپ پرداخت دریافت شد. مقصد را انتخاب کنید: فاکتور جدید یا فاکتور بدون رسید.`,
          )
        } else if (sharedNote) {
          setNote((prev) => (prev ? `${prev}\n${sharedNote}` : sharedNote))
          setShareInfo({ mode: 'pick', hasFile: false, sharedNote })
          setShareTargetChoice('new')
          setSuccess('متن پرداخت دریافت شد. مقصد را انتخاب کنید.')
        }

        if (payload.tooLarge) {
          setError('حجم تصویر اشتراک‌گذاری‌شده زیاد بود. لطفاً دوباره با حجم کمتر پیوست کنید.')
        }

        clearPendingSharePayload()
        onShareConsumed?.()
      } catch (err) {
        console.error(err)
        setError(err.message || 'اعمال فایل اشتراک‌گذاری‌شده ناموفق بود')
        onShareConsumed?.()
      }
    }

    apply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareMode, loading, invoices.length])

  /** فاکتورهایی که هنوز تصویر/رسید ندارند — قابل انتخاب برای پیوست */
  const invoicesWithoutReceipt = useMemo(
    () => (invoices || []).filter((inv) => !String(inv.attachment_url || '').trim()),
    [invoices],
  )

  const applyShareTargetChoice = (choice) => {
    setShareTargetChoice(choice)
    setError('')
    const file = shareInfo?.file || attachFile
    if (!file) {
      setError('فایل اشتراک‌گذاری‌شده در دسترس نیست')
      return
    }

    if (choice === 'new') {
      // از laterFileByIdهای قبلی سهم‌شده پاک کن (فقط انتخاب مقصد)
      setLaterFileById((prev) => {
        const next = { ...prev }
        for (const inv of invoicesWithoutReceipt) {
          if (next[inv.id] === file || next[inv.id] === shareInfo?.file) delete next[inv.id]
        }
        return next
      })
      clearSelectedExpenseForShare()
      pickAttach(file)
      setShareInfo((s) => (s ? { ...s, mode: 'new', hasFile: true, file } : s))
      setSuccess('مقصد: فاکتور جدید — ردیف‌ها را کامل کنید و ثبت کنید.')
      return
    }

    const invId = Number(choice)
    const inv = invoices.find((x) => Number(x.id) === invId)
    if (!inv) {
      setError('فاکتور انتخاب‌شده یافت نشد')
      return
    }
    if (String(inv.attachment_url || '').trim()) {
      setError('این فاکتور از قبل رسید/پیوست دارد. فقط فاکتورهای بدون رسید قابل انتخاب‌اند.')
      setShareTargetChoice('new')
      return
    }

    // از فرم جدید بردار و به فاکتور موجود بده
    setLaterFileById((prev) => {
      const next = { ...prev }
      for (const x of invoicesWithoutReceipt) {
        if (next[x.id] === file || next[x.id] === shareInfo?.file) delete next[x.id]
      }
      next[invId] = file
      return next
    })
    setSelectedExpenseForShare(invId)
    setExpandedId(invId)
    setShareInfo((s) =>
      s
        ? { ...s, mode: 'existing', invoiceId: invId, hasFile: true, file, fileName: file.name }
        : s,
    )
    // attachFile را روی فرم جدید نگه می‌داریم تا اگر خواست برگردد به new
    setSuccess(
      `مقصد: فاکتور ${inv.invoice_no || inv.id} (بدون رسید). دکمه «ذخیره پیوست» را در جزئیات فاکتور بزنید.`,
    )
  }

  const clearAttach = () => {
    setAttachFile(null)
    setAttachPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return ''
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  const uploadAttachment = async (file) => {
    if (!file) return ''
    const prepared = await prepareReceiptFile(file, file.name || 'expense-invoice.jpg')
    if (!prepared?.base64) throw new Error('آماده‌سازی تصویر فاکتور ناموفق بود')
    const res = await fetch('/api/receipt-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: prepared.base64,
        fileName: prepared.fileName || 'expense.jpg',
        contentType: prepared.contentType || 'image/jpeg',
        kind: 'expense',
        unit_name: `block-${admin.block_number || 'x'}`,
        block_number: admin.block_number,
        block_direction: admin.block_direction,
        created_by: admin.full_name || 'مدیر بلوک',
        bill_id: `exp_${Date.now()}`,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.url) throw new Error(data.error || 'آپلود تصویر فاکتور ناموفق بود')
    return data.url
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const items: any[] = []
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const amount = Number(toEnglishDigits(l.amount).replace(/[^\d.]/g, ''))
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(`ردیف ${i + 1}: مبلغ معتبر وارد کنید`)
        return
      }
      if (l.title === 'سایر' && !String(l.other_type || '').trim()) {
        setError(`ردیف ${i + 1}: نوع «سایر» را بنویسید`)
        return
      }
      items.push({
        title: l.title,
        other_type: l.other_type,
        amount,
        description: l.description,
      })
    }

    const dateLabel = dateAuto
      ? 'امروز (اتومات)'
      : expenseDate || 'امروز (اتومات)'
    if (
      !confirm(
        `فاکتور خرج‌کرد با ${items.length.toLocaleString('fa-IR')} ردیف و جمع ${totalDraft.toLocaleString('fa-IR')} تومان\nتاریخ خرج: ${dateLabel}\nثبت شود؟`,
      )
    ) {
      return
    }

    setBusy(true)
    try {
      let attachment_url = ''
      if (attachFile) {
        attachment_url = await uploadAttachment(attachFile)
      }

      const res = await fetch('/api/block-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_number: admin.block_number,
          block_direction: admin.block_direction,
          note,
          created_by: admin.full_name || 'مدیر بلوک',
          // اگر اتومات یا خالی → سرور تاریخ ثبت را می‌گذارد
          expense_date: dateAuto ? '' : expenseDate || '',
          attachment_url,
          items,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ثبت فاکتور ناموفق بود')
      setSuccess(
        `فاکتور خرج‌کرد ثبت شد — ${items.length.toLocaleString('fa-IR')} ردیف، جمع ${money(data.invoice?.total_amount || totalDraft)}` +
          (data.invoice?.expense_date
            ? ` · تاریخ ${formatFaDateOnly(data.invoice.expense_date)}`
            : ''),
      )
      setLines([emptyLine()])
      setNote('')
      setDateAuto(true)
      setExpenseDate(todayInputValue())
      clearAttach()
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setBusy(false)
    }
  }

  const removeInvoice = async (id) => {
    if (!confirm('این فاکتور خرج‌کرد حذف شود؟')) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/block-expenses', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'حذف ناموفق')
      setSuccess('فاکتور حذف شد')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const updateInvoiceDate = async (id, expense_date) => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/block-expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, expense_date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'به‌روزرسانی تاریخ ناموفق')
      setSuccess('تاریخ خرج‌کرد به‌روز شد')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const attachShareToInvoice = (inv) => {
    // اگر فایل share روی فرم جدید است، به این فاکتور منتقل کن
    if (attachFile) {
      setLaterFileById((p) => ({ ...p, [inv.id]: attachFile }))
      setSelectedExpenseForShare(inv.id)
      setExpandedId(inv.id)
      setShareInfo({ mode: 'existing', invoiceId: inv.id, fileName: attachFile.name, hasFile: true })
      setSuccess(
        `فایل برای فاکتور ${inv.invoice_no || inv.id} آماده است. «ذخیره پیوست» را بزنید.`,
      )
      return
    }
    if (laterFileById[inv.id]) {
      setExpandedId(inv.id)
      setSelectedExpenseForShare(inv.id)
      return
    }
    setSelectedExpenseForShare(inv.id)
    setError('ابتدا از اپ پرداخت اشتراک‌گذاری کنید یا فایل را انتخاب کنید')
  }

  const addAttachmentLater = async (inv) => {
    const file = laterFileById[inv.id]
    if (!file) {
      setError('ابتدا تصویر فاکتور را انتخاب کنید یا از اشتراک‌گذاری اپ پرداخت بفرستید')
      return
    }
    setBusy(true)
    setError('')
    try {
      const url = await uploadAttachment(file)
      const res = await fetch('/api/block-expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, attachment_url: url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ذخیره پیوست ناموفق')
      setSuccess('تصویر فاکتور به فاکتور اضافه شد')
      setLaterFileById((p) => {
        const n = { ...p }
        delete n[inv.id]
        return n
      })
      if (laterRefs.current[inv.id]) laterRefs.current[inv.id].value = ''
      clearSelectedExpenseForShare()
      setShareInfo(null)
      // اگر همان فایل روی فرم جدید بود پاک شود
      if (attachFile && attachFile === file) clearAttach()
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 flex items-center justify-center border-2 border-amber-300">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="panel-title text-lg">خرج‌کرد بلوک</h2>
            <p className="text-xs font-semibold text-slate-600">
              فاکتور چندردیفه + تاریخ خرج + پیوست اختیاری تصویر
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-800"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
        </button>
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="msg-success flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {(shareInfo || shareMode) && (
        <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 space-y-3">
          <div>
            <p className="text-sm font-black text-violet-950">اشتراک‌گذاری از اپ پرداخت</p>
            <p className="text-xs font-bold text-violet-900 leading-6 mt-1">
              {shareInfo?.fileName
                ? `فایل «${shareInfo.fileName}» دریافت شد.`
                : 'فایل/متن پرداخت دریافت شد.'}{' '}
              مقصد را انتخاب کنید:
            </p>
          </div>

          <div className="space-y-2">
            <label
              className={`flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-colors ${
                shareTargetChoice === 'new'
                  ? 'border-violet-500 bg-white shadow-sm'
                  : 'border-violet-200 bg-white/60'
              }`}
            >
              <input
                type="radio"
                name="share-expense-target"
                className="mt-1"
                checked={shareTargetChoice === 'new'}
                onChange={() => applyShareTargetChoice('new')}
              />
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-900">تولید فاکتور جدید</span>
                <span className="block text-[11px] font-bold text-slate-600 mt-0.5 leading-5">
                  تصویر به فرم فاکتور جدید پیوست می‌شود؛ بعد از تکمیل ردیف‌ها ثبت کنید.
                </span>
              </span>
            </label>

            {invoicesWithoutReceipt.length === 0 ? (
              <div className="rounded-xl border border-dashed border-violet-200 bg-white/50 px-3 py-2.5 text-[11px] font-bold text-violet-800 leading-5">
                فاکتور ثبت‌شدهٔ بدون رسید/پیوست وجود ندارد. فقط می‌توانید فاکتور جدید بسازید.
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] font-black text-violet-900 px-0.5">
                  یا پیوست به فاکتور بدون رسید:
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5">
                  {invoicesWithoutReceipt.map((inv) => {
                    const val = String(inv.id)
                    const selected = shareTargetChoice === val
                    return (
                      <label
                        key={inv.id}
                        className={`flex items-start gap-2.5 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-colors ${
                          selected
                            ? 'border-emerald-500 bg-white shadow-sm'
                            : 'border-violet-200 bg-white/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="share-expense-target"
                          className="mt-1"
                          checked={selected}
                          onChange={() => applyShareTargetChoice(val)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-sm font-black text-slate-900">
                              {inv.invoice_no || `فاکتور #${inv.id}`}
                            </span>
                            <span className="text-[11px] font-black text-rose-700">
                              {money(inv.total_amount)}
                            </span>
                          </span>
                          <span className="block text-[11px] font-bold text-slate-600 mt-0.5">
                            تاریخ خرج: {formatFaDateOnly(inv.expense_date || inv.created_at)}
                            {' · '}
                            {(inv.items || []).length.toLocaleString('fa-IR')} ردیف
                            {' · '}
                            <span className="text-amber-700">بدون رسید</span>
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {shareTargetChoice !== 'new' && (
            <button
              type="button"
              disabled={busy || !laterFileById[Number(shareTargetChoice)]}
              onClick={() => {
                const inv = invoices.find((x) => Number(x.id) === Number(shareTargetChoice))
                if (inv) addAttachmentLater(inv)
              }}
              className="btn-admin !mt-0 w-full !py-2.5 text-sm disabled:opacity-50"
            >
              {busy ? 'در حال ذخیره پیوست...' : 'ذخیره پیوست روی فاکتور انتخاب‌شده'}
            </button>
          )}
        </div>
      )}

      <form onSubmit={submit} className="panel-card rounded-2xl border-2 border-orange-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-orange-600" />
            فاکتور خرج جدید
          </p>
          <button type="button" onClick={addLine} className="btn-ghost !py-1.5 !text-xs inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            ردیف جدید
          </button>
        </div>

        {/* تاریخ خرج — دستی / اتومات */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-black text-sky-950 inline-flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              تاریخ خرج‌کرد
            </span>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="radio"
                name="exp-date-mode"
                checked={dateAuto}
                onChange={() => {
                  setDateAuto(true)
                  setExpenseDate(todayInputValue())
                }}
              />
              اتومات (روز ثبت)
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="radio"
                name="exp-date-mode"
                checked={!dateAuto}
                onChange={() => setDateAuto(false)}
              />
              دستی
            </label>
          </div>
          <input
            type="date"
            className="field-input dir-ltr max-w-xs"
            value={expenseDate}
            disabled={dateAuto}
            onChange={(e) => {
              setDateAuto(false)
              setExpenseDate(e.target.value)
            }}
          />
          <p className="text-[11px] font-bold text-sky-800 leading-5">
            اگر تاریخ خالی بماند یا حالت اتومات باشد، همان روز ثبت فاکتور ذخیره می‌شود.
          </p>
        </div>

        <div className="space-y-2">
          {lines.map((line, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 grid sm:grid-cols-12 gap-2 items-end"
            >
              <div className="sm:col-span-1 text-center text-xs font-black text-slate-500 pb-2">
                {(idx + 1).toLocaleString('fa-IR')}
              </div>
              <label className="block sm:col-span-3">
                <span className="field-label text-[11px] mb-1 block">عنوان</span>
                <select
                  className="field-input !py-2"
                  value={line.title}
                  onChange={(e) =>
                    setLine(idx, {
                      title: e.target.value,
                      other_type: e.target.value === 'سایر' ? line.other_type : '',
                    })
                  }
                >
                  {EXPENSE_TITLES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              {line.title === 'سایر' ? (
                <label className="block sm:col-span-3">
                  <span className="field-label text-[11px] mb-1 block">شرح سایر</span>
                  <input
                    className="field-input !py-2"
                    value={line.other_type}
                    onChange={(e) => setLine(idx, { other_type: e.target.value })}
                    placeholder="مثلاً نظافت"
                    required
                  />
                </label>
              ) : (
                <label className="block sm:col-span-3">
                  <span className="field-label text-[11px] mb-1 block">توضیح (اختیاری)</span>
                  <input
                    className="field-input !py-2"
                    value={line.description}
                    onChange={(e) => setLine(idx, { description: e.target.value })}
                    placeholder="—"
                  />
                </label>
              )}
              <label className="block sm:col-span-3">
                <span className="field-label text-[11px] mb-1 block">مبلغ (تومان)</span>
                <input
                  className="field-input !py-2 dir-ltr"
                  value={line.amount}
                  onChange={(e) =>
                    setLine(idx, { amount: toEnglishDigits(e.target.value).replace(/[^\d]/g, '') })
                  }
                  inputMode="numeric"
                  placeholder="0"
                  required
                />
                {line.amount && (
                  <p className="text-[10px] font-bold text-emerald-700 mt-0.5">
                    {amountToPersianTomanLabel(line.amount)}
                  </p>
                )}
              </label>
              <div className="sm:col-span-2 flex justify-end pb-0.5">
                <button
                  type="button"
                  onClick={() => removeLine(idx)}
                  disabled={lines.length <= 1}
                  className="p-2 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 disabled:opacity-40"
                  title="حذف ردیف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {line.title === 'سایر' && (
                <label className="block sm:col-span-11 sm:col-start-2">
                  <span className="field-label text-[11px] mb-1 block">توضیح تکمیلی</span>
                  <input
                    className="field-input !py-2"
                    value={line.description}
                    onChange={(e) => setLine(idx, { description: e.target.value })}
                  />
                </label>
              )}
            </div>
          ))}
        </div>

        {/* پیوست تصویر — اختیاری */}
        <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-black text-orange-950 inline-flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              پیوست تصویر فاکتور (اختیاری)
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
              className="sr-only"
              onChange={(e) => pickAttach(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-ghost !py-1.5 !text-xs inline-flex items-center gap-1"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {attachFile ? 'تغییر فایل' : 'انتخاب فایل'}
            </button>
          </div>
          <p className="text-[11px] font-bold text-orange-900 leading-5">
            اجباری نیست؛ می‌توانید بعداً هم به فاکتور اضافه کنید.
          </p>
          {attachFile && (
            <div className="rounded-lg border border-orange-200 bg-white p-2 space-y-1.5">
              {attachPreview ? (
                <img
                  src={attachPreview}
                  alt="پیش‌نمایش فاکتور"
                  className="max-h-36 w-full object-contain rounded-md bg-slate-50"
                />
              ) : (
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  {attachFile.name}
                </p>
              )}
              <button
                type="button"
                onClick={clearAttach}
                className="text-xs font-black text-rose-700 inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                حذف پیوست
              </button>
            </div>
          )}
        </div>

        <label className="block">
          <span className="field-label text-xs mb-1.5 block">یادداشت فاکتور (اختیاری)</span>
          <textarea
            className="field-input min-h-[64px] resize-y"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="مثلاً هزینه‌های هفته اول ماه"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-orange-50 border border-orange-200 px-3 py-2.5">
          <span className="text-sm font-black text-orange-950">
            جمع فاکتور: {money(totalDraft)}
          </span>
          <span className="text-xs font-bold text-orange-800">
            {lines.length.toLocaleString('fa-IR')} ردیف
            {' · '}
            تاریخ: {dateAuto ? 'اتومات' : formatFaDateOnly(expenseDate)}
          </span>
        </div>

        <button type="submit" disabled={busy} className="btn-admin !mt-0 w-full inline-flex items-center justify-center gap-2">
          <Receipt className="w-4 h-4" />
          {busy ? 'در حال ثبت...' : 'ثبت فاکتور خرج‌کرد'}
        </button>
      </form>

      <div className="sheet-frame">
        <div className="sheet-titlebar">
          <span>فاکتورهای ثبت‌شده</span>
          <span className="text-[11px]">{invoices.length.toLocaleString('fa-IR')} فاکتور</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-9 h-9 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 text-sky-800 font-semibold text-sm">
            هنوز خرج‌کردی ثبت نشده است
          </div>
        ) : (
          <div className="divide-y divide-slate-100 bg-white">
            {invoices.map((inv) => {
              const open = expandedId === inv.id
              return (
                <div key={inv.id} className="p-3.5 space-y-2">
                  <button
                    type="button"
                    className="w-full text-right flex flex-wrap items-center justify-between gap-2"
                    onClick={() => setExpandedId(open ? null : inv.id)}
                  >
                    <div>
                      <p className="font-black text-slate-900 text-sm">
                        فاکتور {inv.invoice_no || `#${inv.id}`}
                      </p>
                      <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                        تاریخ خرج: {formatFaDateOnly(inv.expense_date || inv.created_at)}
                        {' · '}
                        ثبت: {formatDateTime(inv.created_at)}
                        {inv.created_by ? ` · ${inv.created_by}` : ''}
                        {' · '}
                        {(inv.items || []).length.toLocaleString('fa-IR')} ردیف
                        {inv.attachment_url ? ' · 📎 پیوست' : ''}
                      </p>
                    </div>
                    <div className="text-left">
                      <p className="font-black text-rose-700 text-sm">{money(inv.total_amount)}</p>
                      <p className="text-[10px] font-bold text-sky-700">{open ? '▲ بستن' : '▼ جزئیات'}</p>
                    </div>
                  </button>
                  {open && (
                    <div className="rounded-xl border border-slate-200 overflow-hidden space-y-0">
                      <div className="px-3 py-2 bg-sky-50 border-b border-slate-200 grid sm:grid-cols-2 gap-2">
                        <label className="block">
                          <span className="field-label text-[11px] mb-1 block">ویرایش تاریخ خرج</span>
                          <input
                            type="date"
                            className="field-input !py-2 dir-ltr"
                            defaultValue={
                              inv.expense_date
                                ? String(inv.expense_date).slice(0, 10)
                                : String(inv.created_at || '').slice(0, 10)
                            }
                            onBlur={(e) => {
                              const v = e.target.value
                              const cur = inv.expense_date
                                ? String(inv.expense_date).slice(0, 10)
                                : String(inv.created_at || '').slice(0, 10)
                              if (v && v !== cur) updateInvoiceDate(inv.id, v)
                            }}
                          />
                        </label>
                        <div className="block">
                          <span className="field-label text-[11px] mb-1 block">
                            پیوست تصویر {inv.attachment_url ? '(جایگزین)' : '(اضافه کردن)'}
                          </span>
                          <div className="flex flex-wrap gap-2 items-center">
                            <input
                              ref={(el) => {
                                laterRefs.current[inv.id] = el
                              }}
                              type="file"
                              accept="image/*,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                              className="text-[11px] max-w-full"
                              onChange={(e) =>
                                setLaterFileById((p) => ({
                                  ...p,
                                  [inv.id]: e.target.files?.[0] || null,
                                }))
                              }
                            />
                            {(attachFile || shareInfo?.hasFile) && (
                              <button
                                type="button"
                                onClick={() => attachShareToInvoice(inv)}
                                className="btn-ghost !py-1.5 !text-xs inline-flex items-center gap-1"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                پیوست از اشتراک
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy || !laterFileById[inv.id]}
                              onClick={() => addAttachmentLater(inv)}
                              className="btn-ghost !py-1.5 !text-xs disabled:opacity-50"
                            >
                              {laterFileById[inv.id] ? 'ذخیره پیوست' : 'ذخیره پیوست'}
                            </button>
                          </div>
                          {laterFileById[inv.id] && (
                            <p className="text-[11px] font-bold text-emerald-800 mt-1">
                              آماده: {laterFileById[inv.id].name || 'فایل'}
                            </p>
                          )}
                        </div>
                      </div>

                      {inv.attachment_url && (
                        <div className="px-3 py-2 border-b border-slate-100 bg-white">
                          <a
                            href={inv.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-black text-sky-700 underline"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            مشاهده تصویر / فایل فاکتور
                          </a>
                          {/\.(jpe?g|png|webp|gif)(\?|$)/i.test(inv.attachment_url) && (
                            <img
                              src={inv.attachment_url}
                              alt="فاکتور"
                              className="mt-2 max-h-40 rounded-lg border border-slate-200 object-contain bg-slate-50 w-full"
                            />
                          )}
                        </div>
                      )}

                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700">
                            <th className="px-2 py-1.5 text-right">عنوان</th>
                            <th className="px-2 py-1.5 text-right">توضیح</th>
                            <th className="px-2 py-1.5 text-left">مبلغ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(inv.items || []).map((it) => (
                            <tr key={it.id} className="border-t border-slate-100">
                              <td className="px-2 py-1.5 font-extrabold">{it.title}</td>
                              <td className="px-2 py-1.5 font-semibold text-slate-600">
                                {it.description || '—'}
                              </td>
                              <td className="px-2 py-1.5 font-black dir-ltr text-left">
                                {Number(it.amount || 0).toLocaleString('fa-IR')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {inv.note && (
                        <p className="px-2 py-2 text-[11px] font-bold text-slate-600 border-t border-slate-100">
                          یادداشت: {inv.note}
                        </p>
                      )}
                      <div className="px-2 py-2 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeInvoice(inv.id)}
                          className="text-xs font-black text-rose-700 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف فاکتور
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
