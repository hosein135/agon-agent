import {
  sortBillsUnpaidFirst,
  isBillPaid,
  isBillPending,
  isBillUnpaid,
} from '../lib/billStatus'
import { uploadReceiptToStorage } from '../lib/uploadReceipt'
import {
  clearReceiptDraft,
  loadAllDraftsForUnit,
  saveReceiptDraft,
} from '../lib/receiptDraft'
import {
  clearPendingSharePayload,
  clearSelectedBillForShare,
  dataUrlToFile,
  getPendingSharePayload,
  getSelectedBillForShare,
  hasPendingSharePayload,
  setSelectedBillForShare,
} from '../lib/shareTarget'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangedHandler, PanelUser } from '../types'
import {
  Receipt,
  AlertCircle,
  CheckCircle2,
  Clock3,
  XCircle,
  Paperclip,
  Send,
  Image as ImageIcon,
  FileText,
  X,
  Link2,
  Share2,
} from 'lucide-react'

const MAX_FILE_BYTES = 12 * 1024 * 1024

export default function ResidentBills({
  user,
  onChanged,
  shareMode = false,
  onShareConsumed,
}: {
  user: PanelUser
  onChanged?: ChangedHandler
  shareMode?: boolean
  onShareConsumed?: ChangedHandler
}) {
  const [bills, setBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [progress, setProgress] = useState('')
  const [filesById, setFilesById] = useState({})
  const [previewsById, setPreviewsById] = useState<Record<string, string>>({})
  const [notesById, setNotesById] = useState({})
  const [openAttachId, setOpenAttachId] = useState(null)
  const [shareInfo, setShareInfo] = useState(null) // { fileName, text, title, url, hasFile }
  const [selectedShareBillId, setSelectedShareBillId] = useState(null)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const shareAppliedRef = useRef(false)

  const load = async ({ silent = false } = {}) => {
    try {
      const params = new URLSearchParams({
        unit_name: user.unit_name,
        for_payer: '1',
      })
      if (user?.id != null) params.set('resident_id', String(user.id))
      if (user?.occupancy) params.set('occupancy', String(user.occupancy))
      const res = await fetch(`/api/bills?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت قبض‌ها')
      setBills(Array.isArray(data) ? data : [])

      // بازگردانی پیش‌نویس رسید بعد از رفرش
      if (!silent && user?.unit_name) {
        try {
          const drafts = await loadAllDraftsForUnit(user.unit_name)
          if (drafts.length) {
            setFilesById((prev) => {
              const next = { ...prev }
              for (const d of drafts) {
                if (d.file && d.bill_id != null) next[d.bill_id] = d.file
              }
              return next
            })
            setNotesById((prev) => {
              const next = { ...prev }
              for (const d of drafts) {
                if (d.note && d.bill_id != null) next[d.bill_id] = d.note
              }
              return next
            })
            setPreviewsById((prev) => {
              const next = { ...prev }
              for (const d of drafts) {
                if (d.file && d.file.type?.startsWith('image/')) {
                  if (next[d.bill_id]) URL.revokeObjectURL(next[d.bill_id])
                  next[d.bill_id] = URL.createObjectURL(d.file)
                }
              }
              return next
            })
            if (drafts[0]?.bill_id) setOpenAttachId(Number(drafts[0].bill_id))
          }
        } catch (e) {
          console.warn('draft restore failed', e)
        }
      }
    } catch (err) {
      if (!silent) setError(err.message || 'خطا')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load({ silent: false })
    const t = setInterval(() => load({ silent: true }), 20000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.unit_name])

  useEffect(() => {
    return () => {
      Object.values(previewsById).forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
    }
  }, [previewsById])

  // اعمال رسید اشتراک‌گذاری‌شده از اپ پرداخت
  useEffect(() => {
    if (shareAppliedRef.current) return
    if (!shareMode && !hasPendingSharePayload()) return
    if (loading) return

    const apply = async () => {
      const payload = getPendingSharePayload()
      if (!payload) {
        if (shareMode) {
          setError(
            'فایل اشتراک‌گذاری‌شده پیدا نشد. دوباره از اپ پرداخت، رسید را با «اشتراک‌گذاری» به بلوک هفت شرقی بفرستید.',
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
            payload.fileName || `receipt-share-${Date.now()}.jpg`,
          )
        }

        const noteParts: string[] = []
        if (payload.title) noteParts.push(String(payload.title))
        if (payload.text) noteParts.push(String(payload.text))
        if (payload.url) noteParts.push(String(payload.url))
        const sharedNote = noteParts.filter(Boolean).join(' | ').slice(0, 400)

        const selectable = sortBillsUnpaidFirst(bills).filter(
          (b) => isBillUnpaid(b.status) || (isBillPending(b.status) && !b.attachment_url),
        )

        // انتخاب خودکار: bill_id ذخیره‌شده یا اگر فقط یک قبض قابل ارسال باشد
        let autoId = getSelectedBillForShare()
        if (autoId && !selectable.some((b) => Number(b.id) === Number(autoId))) autoId = null
        if (!autoId && selectable.length === 1) autoId = selectable[0].id

        if (file) {
          if (autoId) {
            pickFile(autoId, file)
            setSelectedShareBillId(Number(autoId))
            if (sharedNote) setNotesById((p) => ({ ...p, [autoId]: sharedNote }))
          } else {
            // هنوز قبض انتخاب نشده — فایل را موقتاً روی shareInfo نگه می‌داریم
            setShareInfo({
              fileName: file.name,
              file,
              text: payload.text || '',
              title: payload.title || '',
              url: payload.url || '',
              hasFile: true,
              note: sharedNote,
            })
          }
        } else {
          setShareInfo({
            fileName: '',
            file: null,
            text: payload.text || '',
            title: payload.title || '',
            url: payload.url || '',
            hasFile: false,
            note: sharedNote,
          })
          if (autoId && sharedNote) {
            setNotesById((p) => ({ ...p, [autoId]: sharedNote }))
            setSelectedShareBillId(Number(autoId))
            setOpenAttachId(Number(autoId))
          }
        }

        if (payload.tooLarge) {
          setError('حجم تصویر اشتراک‌گذاری‌شده زیاد بود. لطفاً دوباره با حجم کمتر پیوست کنید.')
        } else if (file) {
          setSuccess(
            autoId
              ? 'رسید از اپ پرداخت دریافت و به قبض وصل شد. دکمه «ارسال رسید برای مدیر» را بزنید.'
              : 'رسید از اپ پرداخت دریافت شد. قبض مورد نظر را انتخاب کنید تا وصل شود.',
          )
        } else if (sharedNote) {
          setSuccess('اطلاعات پرداخت از اشتراک‌گذاری دریافت شد. تصویر رسید را هم پیوست کنید.')
        }

        clearPendingSharePayload()
        onShareConsumed?.()
      } catch (err) {
        setError(err.message || 'خطا در دریافت فایل اشتراک‌گذاری‌شده')
        onShareConsumed?.()
      }
    }

    apply()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareMode, loading, bills.length])

  const pickFile = (billId, file) => {
    setError('')
    if (!file) return
    // فایل share گاهی type خالی دارد
    const ok =
      !file.type ||
      file.type === 'application/octet-stream' ||
      (file.type && (file.type.startsWith('image/') || file.type === 'application/pdf')) ||
      /\.(jpe?g|png|webp|gif|pdf|heic|heif)$/i.test(file.name || '')
    if (!ok) {
      setError('فقط تصویر یا PDF مجاز است')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('حجم فایل خیلی زیاد است')
      return
    }
    setFilesById((p) => ({ ...p, [billId]: file }))
    setOpenAttachId(billId)
    setSelectedShareBillId(Number(billId))
    setSelectedBillForShare(billId)
    saveReceiptDraft({
      unit_name: user?.unit_name,
      bill_id: billId,
      file,
      note: notesById[billId] || '',
    }).catch(() => {})

    if (
      !file.type ||
      file.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '')
    ) {
      const url = URL.createObjectURL(file)
      setPreviewsById((p) => {
        if (p[billId]) URL.revokeObjectURL(p[billId])
        return { ...p, [billId]: url }
      })
    } else {
      setPreviewsById((p) => {
        if (p[billId]) URL.revokeObjectURL(p[billId])
        return { ...p, [billId]: '' }
      })
    }
  }

  const attachSharedFileToBill = (billId) => {
    const file = shareInfo?.file
    if (!file) {
      setError('فایل اشتراک‌گذاری‌شده در دسترس نیست. دوباره پیوست کنید.')
      return
    }
    pickFile(billId, file)
    if (shareInfo?.note) {
      setNotesById((p) => ({ ...p, [billId]: shareInfo.note }))
      saveReceiptDraft({
        unit_name: user?.unit_name,
        bill_id: billId,
        file,
        note: shareInfo.note,
      }).catch(() => {})
    }
    setShareInfo((s) => (s ? { ...s, attachedTo: billId } : s))
    setSuccess(`رسید به قبض وصل شد. «ارسال رسید برای مدیر» را بزنید.`)
  }

  const clearFile = (billId) => {
    setFilesById((p) => {
      const n = { ...p }
      delete n[billId]
      return n
    })
    setPreviewsById((p) => {
      if (p[billId]) URL.revokeObjectURL(p[billId])
      const n = { ...p }
      delete n[billId]
      return n
    })
    if (inputRefs.current[billId]) inputRefs.current[billId].value = ''
    if (Number(selectedShareBillId) === Number(billId)) {
      setSelectedShareBillId(null)
      clearSelectedBillForShare()
    }
    clearReceiptDraft(user?.unit_name, billId).catch(() => {})
  }

  const openFilePicker = (billId) => {
    setOpenAttachId(billId)
    setTimeout(() => inputRefs.current[billId]?.click(), 0)
  }

  const postJson = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      throw new Error(
        res.ok ? 'پاسخ نامعتبر از سرور' : `خطای سرور (${res.status}): ${text.slice(0, 100)}`,
      )
    }
    if (!res.ok) throw new Error(data.error || `خطا (${res.status})`)
    return data
  }

  const sendReceipt = async (bill) => {
    if (isBillPaid(bill.status)) return
    if (isBillPending(bill.status) && bill.attachment_url) {
      setError('این رسید قبلاً ارسال شده و منتظر تایید مدیر است')
      return
    }

    let file = filesById[bill.id] || null
    if (!file && shareInfo?.file && Number(shareInfo.attachedTo) === Number(bill.id)) {
      file = shareInfo.file
    }
    if (!file && shareInfo?.file && selectableBills.length === 1) {
      file = shareInfo.file
      pickFile(bill.id, file)
    }
    if (!file) {
      try {
        const drafts = await loadAllDraftsForUnit(user.unit_name)
        const d = drafts.find((x) => Number(x.bill_id) === Number(bill.id))
        if (d?.file) file = d.file
      } catch {
        /* ignore */
      }
    }

    if (!file) {
      setError('ابتدا تصویر رسید را پیوست یا از اشتراک‌گذاری به این قبض وصل کنید')
      if (!shareInfo?.hasFile) openFilePicker(bill.id)
      return
    }

    saveReceiptDraft({
      unit_name: user.unit_name,
      bill_id: bill.id,
      file,
      note: notesById[bill.id] || shareInfo?.note || '',
    }).catch(() => {})

    setBusyId(bill.id)
    setError('')
    setSuccess('')
    setProgress('در حال آماده‌سازی...')

    try {
      // آپلود مستقیم با لینک امضا — بدون سقف body سرور
      const up = await uploadReceiptToStorage({
        file,
        unit_name: user.unit_name,
        bill_id: bill.id,
        onProgress: setProgress,
      })
      if (!up?.url) throw new Error('آدرس فایل بعد از آپلود ساخته نشد')

      setProgress('در حال ثبت رسید روی قبض...')
      const data = await postJson('/api/bills', {
        action: 'submit_receipt',
        id: bill.id,
        bill_id: bill.id,
        unit_name: user.unit_name,
        attachment_url: up.url,
        note: notesById[bill.id] || shareInfo?.note || '',
        created_by: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.unit_name,
        resident_id: user.id,
        occupancy: user.occupancy || '',
      })

      const ok =
        data?.ok ||
        isBillPending(data?.status) ||
        data?.bill_status === 'در انتظار تایید' ||
        isBillPending(data?.bill?.status)

      if (!ok) {
        throw new Error(data?.error || 'ثبت رسید ناموفق بود')
      }

      const nextAttach = data?.attachment_url || data?.bill?.attachment_url || up.url
      setBills((prev) =>
        prev.map((x) =>
          Number(x.id) === Number(bill.id)
            ? {
                ...x,
                ...(data.bill || {}),
                status: 'در انتظار تایید',
                attachment_url: nextAttach,
                has_receipt: true,
              }
            : x,
        ),
      )

      setSuccess(`رسید «${bill.title}» با موفقیت برای مدیر ارسال و ذخیره شد.`)
      clearFile(bill.id)
      await clearReceiptDraft(user.unit_name, bill.id)
      setOpenAttachId(null)
      setNotesById((p) => {
        const n = { ...p }
        delete n[bill.id]
        return n
      })
      setShareInfo(null)
      clearPendingSharePayload()
      clearSelectedBillForShare()
      onChanged?.()
      setTimeout(() => load({ silent: true }), 500)
    } catch (err) {
      console.error(err)
      setError(
        (err && err.message) ||
          'ارسال ناموفق بود. فایل روی دستگاه مانده؛ دوباره «ارسال» را بزنید.',
      )
      // فایل را پاک نکن — با رفرش هم از IndexedDB برمی‌گردد
    } finally {
      setBusyId(null)
      setProgress('')
    }
  }

  const formatMoney = (n) => `${Number(n || 0).toLocaleString('fa-IR')} تومان`
  const formatDateTime = (iso) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return `${d.toLocaleDateString('fa-IR')} — ${d.toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    } catch {
      return iso
    }
  }

  const sortedBills = useMemo(() => sortBillsUnpaidFirst(bills), [bills])
  const selectableBills = useMemo(
    () =>
      sortedBills.filter(
        (b) => isBillUnpaid(b.status) || (isBillPending(b.status) && !b.attachment_url),
      ),
    [sortedBills],
  )

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-indigo-600" />
        <h2 className="panel-title text-lg">رسید</h2>
      </div>
      <p className="text-sm text-slate-600 font-semibold leading-7">
        ۱) پیوست تصویر رسید &nbsp; ۲) <strong>ارسال برای مدیر</strong>
        <br />
        از اپ پرداخت هم می‌توانید با <strong>اشتراک‌گذاری</strong> رسید را مستقیم به اینجا بفرستید.
      </p>

      {/* بنر اشتراک‌گذاری از اپ پرداخت */}
      {(shareInfo || shareMode) && (
        <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-black text-violet-900">
            <Share2 className="w-4 h-4" />
            رسید از اپ پرداخت / اشتراک‌گذاری
          </div>
          {shareInfo?.hasFile && !shareInfo?.attachedTo && (
            <p className="text-xs font-bold text-violet-800 leading-6">
              فایل «{shareInfo.fileName || 'رسید'}» دریافت شد. روی{' '}
              <strong>اتصال به این قبض</strong> بزنید، سپس ارسال کنید.
            </p>
          )}
          {shareInfo?.attachedTo && (
            <p className="text-xs font-bold text-emerald-800 leading-6">
              رسید به قبض وصل شد. دکمه «ارسال رسید برای مدیر» را بزنید.
            </p>
          )}
          {!shareInfo?.hasFile && (shareInfo?.text || shareInfo?.url) && (
            <p className="text-xs font-bold text-violet-800 leading-6 break-all">
              متن/لینک دریافت‌شده: {shareInfo.text || shareInfo.url}
              <br />
              تصویر رسید را هم پیوست کنید.
            </p>
          )}
          {selectableBills.length === 0 && (
            <p className="text-xs font-bold text-rose-700">
              قبض پرداخت‌نشده‌ای برای اتصال وجود ندارد.
            </p>
          )}
        </div>
      )}

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
      {progress && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          {progress}
        </div>
      )}

      {sortedBills.length === 0 ? (
        <div className="panel-card rounded-2xl p-8 text-center text-slate-500 font-semibold">
          قبضی برای شما ارسال نشده است
        </div>
      ) : (
        <div className="space-y-3">
          {sortedBills.map((b) => {
            const paid = isBillPaid(b.status)
            const pending = isBillPending(b.status)
            const unpaid = !paid && !pending
            const canAttach = unpaid || (pending && !b.attachment_url)
            const file = filesById[b.id]
            const preview = previewsById[b.id]
            const showPanel = canAttach && (openAttachId === b.id || Boolean(file))
            const isShareTarget =
              Number(selectedShareBillId) === Number(b.id) ||
              Number(shareInfo?.attachedTo) === Number(b.id)
            const needsShareAttach =
              canAttach && shareInfo?.hasFile && !file && !shareInfo?.attachedTo

            return (
              <article
                key={b.id}
                className={`receipt-card ${
                  paid ? 'is-paid' : pending ? 'is-pending' : 'is-unpaid'
                } ${isShareTarget || needsShareAttach ? 'ring-2 ring-violet-400' : ''}`}
              >
                <div className="receipt-row">
                  <div className="receipt-right">
                    <span className="receipt-kicker">عنوان قبض</span>
                    <h3 className="receipt-title">{b.title}</h3>
                    {(b.payer_name || b.payer_occupancy) && (
                      <p className="text-[11px] font-bold text-violet-800 mt-1">
                        پرداخت‌کننده: {b.payer_name || b.payer_occupancy}
                        {b.payer_occupancy && b.payer_name ? ` (${b.payer_occupancy})` : ''}
                      </p>
                    )}
                  </div>
                  <div className="receipt-left">
                    <span className="receipt-kicker">مبلغ قبض</span>
                    <p
                      className={`receipt-amount ${
                        paid ? 'text-emerald-700' : pending ? 'text-amber-700' : 'text-rose-700'
                      }`}
                    >
                      {formatMoney(b.amount)}
                    </p>
                  </div>
                </div>

                <div className="receipt-row receipt-row-mid">
                  <div className="receipt-right">
                    <span className="receipt-kicker">تاریخ و ساعت ارسال قبض</span>
                    <p className="receipt-datetime">{formatDateTime(b.created_at)}</p>
                  </div>
                  <div className="receipt-left">
                    <span className="receipt-kicker">تایید رسید</span>
                    {paid && (
                      <span className="receipt-confirm is-yes">
                        <CheckCircle2 className="w-4 h-4" />
                        تایید شده
                      </span>
                    )}
                    {pending && (
                      <span className="receipt-confirm is-wait">
                        <Clock3 className="w-4 h-4" />
                        در انتظار تایید
                      </span>
                    )}
                    {unpaid && (
                      <span className="receipt-confirm is-no">
                        <XCircle className="w-4 h-4" />
                        تایید نشده
                      </span>
                    )}
                  </div>
                </div>

                {canAttach && (
                  <div className="receipt-row receipt-row-actions">
                    <div className="receipt-right w-full space-y-3">
                      <input
                        ref={(el) => {
                          inputRefs.current[b.id] = el
                        }}
                        type="file"
                        accept="image/*,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf"
                        capture="environment"
                        className="sr-only"
                        onChange={(e) => pickFile(b.id, e.target.files?.[0])}
                      />

                      {needsShareAttach && (
                        <button
                          type="button"
                          onClick={() => attachSharedFileToBill(b.id)}
                          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm py-2.5"
                        >
                          <Share2 className="w-4 h-4" />
                          اتصال رسید اشتراک‌گذاری‌شده به این قبض
                        </button>
                      )}

                      <button
                        type="button"
                        className="receipt-send-link"
                        onClick={() => openFilePicker(b.id)}
                      >
                        <Link2 className="w-4 h-4 shrink-0" />
                        انتخاب / تغییر تصویر رسید
                      </button>

                      <div className="receipt-actions-row">
                        <button
                          type="button"
                          onClick={() => openFilePicker(b.id)}
                          className="receipt-attach-btn"
                        >
                          <Paperclip className="w-4 h-4 shrink-0" />
                          <span>{file ? 'تغییر پیوست' : 'پیوست رسید'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === b.id || !file}
                          onClick={() => sendReceipt(b)}
                          className="receipt-send-btn !mt-0"
                        >
                          <Send className="w-4 h-4 shrink-0" />
                          <span>{busyId === b.id ? 'در حال ارسال...' : 'ارسال رسید'}</span>
                        </button>
                      </div>
                      {!file && (
                        <p className="text-xs font-bold text-rose-600">
                          برای فعال شدن دکمه ارسال، ابتدا تصویر را پیوست یا از اشتراک‌گذاری وصل کنید.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {showPanel && file && (
                  <div className="receipt-attach-box">
                    <div className="receipt-file-preview">
                      {preview ? (
                        <img src={preview} alt="پیش‌نمایش" className="receipt-file-img" />
                      ) : (
                        <div className="receipt-file-pdf">
                          <FileText className="w-5 h-5 text-indigo-700" />
                          <span>{file.name}</span>
                        </div>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          {file.name} — {(file.size / 1024).toFixed(0)} KB
                        </p>
                        <button
                          type="button"
                          onClick={() => clearFile(b.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-600"
                        >
                          <X className="w-3.5 h-3.5" />
                          حذف
                        </button>
                      </div>
                    </div>
                    <label className="block">
                      <span className="receipt-kicker">توضیح (اختیاری)</span>
                      <input
                        className="field-input !py-2 mt-1"
                        value={notesById[b.id] || ''}
                        onChange={(e) => setNotesById((p) => ({ ...p, [b.id]: e.target.value }))}
                        placeholder="کد پیگیری / توضیح"
                      />
                    </label>
                  </div>
                )}

                {pending && (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-bold text-amber-900 inline-flex items-center gap-2">
                      <Clock3 className="w-4 h-4" />
                      رسید ارسال و ذخیره شد — منتظر تایید مدیر
                    </div>
                    {b.attachment_url && (
                      <a
                        href={b.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs font-bold text-indigo-700 underline"
                      >
                        مشاهده پیوست ذخیره‌شده
                      </a>
                    )}
                  </div>
                )}

                {unpaid && b.reject_reason && (
                  <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-black text-rose-800">
                      <XCircle className="w-4 h-4 shrink-0" />
                      رسید قبلی رد شد
                    </div>
                    <p className="text-xs font-bold text-rose-900 leading-6">
                      <span className="text-rose-700">علت رد مدیر: </span>
                      {b.reject_reason}
                    </p>
                    <p className="text-[11px] font-semibold text-rose-700">
                      لطفاً با توجه به علت بالا، رسید صحیح را دوباره پیوست و ارسال کنید.
                    </p>
                  </div>
                )}

                {paid && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-bold text-emerald-800 inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    تایید شده — قبض سبز
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
