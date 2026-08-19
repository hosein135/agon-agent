import { useRef, useState } from 'react'
import {
  HardDriveDownload,
  HardDriveUpload,
  AlertCircle,
  CheckCircle2,
  Shield,
  FileJson,
  Info,
} from 'lucide-react'
import { toEnglishDigits } from '../lib/digits'
import type { AdminUser, ChangedHandler } from '../types'

function formatBytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fa-IR')
  } catch {
    return iso
  }
}

export default function ManagerBackupRestore({
  admin,
  mode = 'backup',
  onRestored,
}: {
  admin: AdminUser
  mode?: 'backup' | 'restore' | string
  onRestored?: ChangedHandler
}) {
  const isBackup = mode === 'backup'
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [preview, setPreview] = useState(null)
  const [restoreMode, setRestoreMode] = useState('replace') // replace | merge
  const [selectedFile, setSelectedFile] = useState(null)

  const downloadBackup = async () => {
    if (!admin) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const q = new URLSearchParams({
        block_number: admin.block_number,
        block_direction: admin.block_direction,
      })
      const res = await fetch(`/api/block-backup?${q.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'دریافت پشتیبان ناموفق بود')

      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const bn = toEnglishDigits(admin.block_number || '')
      a.href = url
      a.download = `backup-block-${bn}-${admin.block_direction}-${stamp}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      const c = data.counts || {}
      setSuccess(
        `فایل پشتیبان ذخیره شد. ساکنین: ${c.residents ?? 0} | قبض: ${c.bills ?? 0} | رسید: ${c.receipts ?? 0} | چت: ${c.private_chat_msgs ?? 0}`,
      )
      setPreview({
        created_at: data.created_at,
        counts: c,
        size: blob.size,
        block: data.block,
      })
    } catch (err) {
      setError(err.message || 'خطا در پشتیبان‌گیری')
    } finally {
      setBusy(false)
    }
  }

  const onPickFile = async (file) => {
    setError('')
    setSuccess('')
    setPreview(null)
    setSelectedFile(null)
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || data.type !== 'block_backup' || !data.data) {
        throw new Error('فایل انتخاب‌شده پشتیبان معتبر این برنامه نیست')
      }
      setSelectedFile(file)
      setPreview({
        created_at: data.created_at,
        counts: data.counts || {},
        size: file.size,
        block: data.block,
        raw: data,
      })
    } catch (err) {
      setError(err.message || 'خواندن فایل ناموفق بود')
    }
  }

  const restoreBackup = async () => {
    if (!admin || !preview?.raw) {
      setError('ابتدا فایل پشتیبان را انتخاب کنید')
      return
    }
    const warn =
      restoreMode === 'replace'
        ? 'با بازیابی کامل، اطلاعات فعلی این بلوک (ساکنین، قبض‌ها، رسیدها، چت خصوصی و ...) پاک و با فایل پشتیبان جایگزین می‌شود. ادامه می‌دهید؟'
        : 'اطلاعات فایل پشتیبان به داده‌های فعلی اضافه/ادغام می‌شود. ادامه می‌دهید؟'
    if (!confirm(warn)) return

    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/block-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: restoreMode,
          block_number: admin.block_number,
          block_direction: admin.block_direction,
          backup: preview.raw,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'بازیابی ناموفق بود')

      const ins = data.summary?.inserted || {}
      setSuccess(
        `${data.message || 'بازیابی انجام شد'} — ساکنین: ${ins.residents ?? 0} | قبض: ${ins.bills ?? 0} | چت: ${ins.private_chat_msgs ?? 0}`,
      )
      onRestored?.()
    } catch (err) {
      setError(err.message || 'خطا در بازیابی')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        {isBackup ? (
          <HardDriveDownload className="w-5 h-5 text-sky-700" />
        ) : (
          <HardDriveUpload className="w-5 h-5 text-emerald-700" />
        )}
        <div>
          <h2 className="panel-title text-lg">
            {isBackup ? 'پشتیبان‌گیری اطلاعات' : 'بازیابی از پشتیبان'}
          </h2>
          <p className="text-xs font-semibold text-slate-600 mt-0.5">
            بلوک {admin?.block_number} {admin?.block_direction}
          </p>
        </div>
      </div>

      <div className="panel-card rounded-2xl p-4 border border-slate-200 bg-sky-50/40 text-sm font-semibold text-sky-950 leading-7 flex items-start gap-2">
        <Info className="w-4 h-4 mt-1 shrink-0 text-sky-700" />
        <div>
          {isBackup ? (
            <>
              یک فایل <strong>JSON</strong> روی رایانه یا گوشی شما ذخیره می‌شود و شامل ساکنین،
              قبض‌ها، رسیدها، درخواست‌ها، چت خصوصی، گفتگو با مدیر مجتمع و تنظیمات ورود مدیر این بلوک
              است. این فایل را در جای امن نگه دارید.
            </>
          ) : (
            <>
              فایل پشتیبان قبلی را انتخاب کنید تا اطلاعات بازیابی شود. حالت{' '}
              <strong>جایگزینی کامل</strong> داده‌های فعلی همین بلوک را پاک می‌کند و از روی فایل
              می‌نویسد. حالت <strong>ادغام</strong> داده‌ها را اضافه می‌کند.
            </>
          )}
        </div>
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

      {isBackup ? (
        <div className="panel-card rounded-2xl p-5 border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800">
            <Shield className="w-4 h-4 text-emerald-600" />
            ذخیره روی دستگاه
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={downloadBackup}
            className="btn-primary !mt-0 inline-flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <HardDriveDownload className="w-4 h-4" />
            {busy ? 'در حال آماده‌سازی...' : 'دانلود فایل پشتیبان'}
          </button>
        </div>
      ) : (
        <div className="panel-card rounded-2xl p-5 border-2 border-emerald-200 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-slate-800">
            <FileJson className="w-4 h-4 text-emerald-700" />
            انتخاب فایل پشتیبان
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="btn-ghost inline-flex items-center justify-center gap-2 w-full sm:w-auto"
          >
            <HardDriveUpload className="w-4 h-4" />
            {selectedFile ? 'تغییر فایل' : 'انتخاب فایل JSON'}
          </button>
          {selectedFile && (
            <p className="text-xs font-bold text-slate-600">
              فایل: {selectedFile.name} — {formatBytes(selectedFile.size)}
            </p>
          )}

          <div className="grid sm:grid-cols-2 gap-2">
            <label
              className={`rounded-xl border-2 p-3 cursor-pointer ${
                restoreMode === 'replace'
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name="restoreMode"
                className="me-2"
                checked={restoreMode === 'replace'}
                onChange={() => setRestoreMode('replace')}
              />
              <span className="text-sm font-black text-slate-900">جایگزینی کامل</span>
              <p className="text-[11px] font-semibold text-slate-600 mt-1 leading-5">
                پاک کردن داده فعلی بلوک و نوشتن از روی پشتیبان
              </p>
            </label>
            <label
              className={`rounded-xl border-2 p-3 cursor-pointer ${
                restoreMode === 'merge'
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name="restoreMode"
                className="me-2"
                checked={restoreMode === 'merge'}
                onChange={() => setRestoreMode('merge')}
              />
              <span className="text-sm font-black text-slate-900">ادغام</span>
              <p className="text-[11px] font-semibold text-slate-600 mt-1 leading-5">
                افزودن اطلاعات پشتیبان به داده‌های فعلی
              </p>
            </label>
          </div>

          <button
            type="button"
            disabled={busy || !preview?.raw}
            onClick={restoreBackup}
            className="btn-admin !mt-0 inline-flex items-center justify-center gap-2 w-full sm:w-auto disabled:opacity-50"
          >
            <HardDriveUpload className="w-4 h-4" />
            {busy ? 'در حال بازیابی...' : 'شروع بازیابی'}
          </button>
        </div>
      )}

      {preview && (
        <div className="sheet-frame">
          <div className="sheet-titlebar">
            <span>خلاصه فایل</span>
            <span className="text-[11px]">{formatBytes(preview.size)}</span>
          </div>
          <div className="bg-white p-4 grid sm:grid-cols-2 gap-3 text-sm font-semibold text-slate-800">
            <div>
              <span className="text-slate-500 text-xs block">بلوک</span>
              {preview.block?.block_number} {preview.block?.block_direction}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">تاریخ پشتیبان</span>
              {formatDate(preview.created_at)}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">ساکنین</span>
              {(preview.counts?.residents ?? 0).toLocaleString('fa-IR')}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">قبض‌ها</span>
              {(preview.counts?.bills ?? 0).toLocaleString('fa-IR')}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">رسیدها</span>
              {(
                (preview.counts?.receipts ?? 0) + (preview.counts?.payment_receipts ?? 0)
              ).toLocaleString('fa-IR')}
            </div>
            <div>
              <span className="text-slate-500 text-xs block">پیام‌های خصوصی</span>
              {(preview.counts?.private_chat_msgs ?? 0).toLocaleString('fa-IR')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
