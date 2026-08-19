import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Receipt,
  AlertCircle,
  CheckCircle2,
  Send,
  RefreshCw,
  Building2,
  Users,
  Wallet,
  CalendarDays,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import { amountToPersianTomanLabel } from '../lib/numberWords'
import { isBillPaid, isBillPending, isBillUnpaid, billStatusClass, billStatusLabel } from '../lib/billStatus'
import type { AdminUser, ChangedHandler, Resident } from '../types'

function money(n) {
  return `${Number(n || 0).toLocaleString('fa-IR')} تومان`
}

function blockKey(b) {
  const n = onlyDigits(b?.block_number) || toEnglishDigits(b?.block_number || '')
  return `${n}|${String(b?.block_direction || '')}`
}

function currentFaMonthLabel() {
  try {
    return new Date().toLocaleDateString('fa-IR', { year: 'numeric', month: 'long' })
  } catch {
    return ''
  }
}

/**
 * صدور و دریافت شارژ ماهیانه — مدیر مجتمع
 * تولید شارژ برای همه / چند بلوک و ارسال مثل قبض به ساکنین
 */
export default function ComplexMonthlyCharge({
  admin,
  blockManagers = [],
  residents = [],
  onChanged,
}: {
  admin: AdminUser
  blockManagers?: AdminUser[]
  residents?: Resident[]
  onChanged?: ChangedHandler
}) {
  const [amount, setAmount] = useState('')
  const [monthLabel, setMonthLabel] = useState(() => currentFaMonthLabel())
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState('all') // all | blocks
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(() => new Set())
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [charges, setCharges] = useState<any[]>([])
  const [loadingList, setLoadingList] = useState(true)

  const amountWords = amountToPersianTomanLabel(amount)

  const blocks = useMemo(() => {
    const map = new Map()
    for (const bm of blockManagers || []) {
      map.set(blockKey(bm), {
        block_number: bm.block_number,
        block_direction: bm.block_direction,
        full_name: bm.full_name,
      })
    }
    for (const r of residents || []) {
      const k = blockKey(r)
      if (!map.has(k)) {
        map.set(k, {
          block_number: r.block_number,
          block_direction: r.block_direction,
          full_name: `مدیر بلوک ${r.block_number} ${r.block_direction}`,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const an = Number(onlyDigits(a.block_number) || 0)
      const bn = Number(onlyDigits(b.block_number) || 0)
      if (an !== bn) return an - bn
      return String(a.block_direction).localeCompare(String(b.block_direction), 'fa')
    })
  }, [blockManagers, residents])

  const targetResidents = useMemo(() => {
    const list = (residents || []).filter((r) => r.status !== 'blocked')
    if (scope === 'all') return list
    const keys = selectedBlocks
    return list.filter((r) => keys.has(blockKey(r)))
  }, [residents, scope, selectedBlocks])

  const loadCharges = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/monthly-charge')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت شارژها')
      setCharges(Array.isArray(data) ? data : [])
    } catch (err) {
      console.warn(err)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    loadCharges()
  }, [loadCharges])

  const toggleBlock = (b) => {
    const k = blockKey(b)
    setSelectedBlocks((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const selectAllBlocks = () => {
    setSelectedBlocks(new Set(blocks.map(blockKey)))
  }

  const clearBlocks = () => setSelectedBlocks(new Set())

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const amt = Number(toEnglishDigits(amount).replace(/[^\d.]/g, ''))
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('مبلغ شارژ را به‌درستی وارد کنید')
      return
    }
    if (!monthLabel.trim()) {
      setError('ماه شارژ را مشخص کنید')
      return
    }
    if (scope === 'blocks' && selectedBlocks.size === 0) {
      setError('حداقل یک بلوک را انتخاب کنید')
      return
    }
    if (targetResidents.length === 0) {
      setError('ساکنی برای ارسال شارژ یافت نشد')
      return
    }

    if (
      !confirm(
        `شارژ «${monthLabel}» به مبلغ ${amt.toLocaleString('fa-IR')} تومان برای ${targetResidents.length.toLocaleString('fa-IR')} واحد صادر و ارسال شود؟`,
      )
    ) {
      return
    }

    setBusy(true)
    try {
      const payload: any = {
        amount: amt,
        month_label: monthLabel.trim(),
        title: 'شارژ ماهیانه بلوک',
        description:
          description.trim() ||
          `صدور گروهی شارژ ماهیانه توسط ${admin?.full_name || admin?.complex_name || 'مدیر مجتمع'}`,
        created_by: admin?.full_name || admin?.complex_name || 'مدیر مجتمع',
        created_by_role: admin?.role || 'complex_manager',
        skip_duplicates: skipDuplicates,
      }

      if (scope === 'all') {
        payload.all_residents = true
      } else {
        payload.blocks = Array.from(selectedBlocks).map((k) => {
          const [block_number, block_direction] = k.split('|')
          // restore original block_number from blocks list if possible
          const found = blocks.find((b) => blockKey(b) === k)
          return {
            block_number: found?.block_number || block_number,
            block_direction: found?.block_direction || block_direction || '',
          }
        })
      }

      const res = await fetch('/api/monthly-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'صدور شارژ ناموفق بود')

      setSuccess(
        `✅ ${Number(data.created || 0).toLocaleString('fa-IR')} شارژ «${data.title || ''}» صادر و برای ساکنین ارسال شد` +
          (data.skipped
            ? ` — ${Number(data.skipped).toLocaleString('fa-IR')} واحد تکراری رد شد`
            : ''),
      )
      setAmount('')
      setDescription('')
      await loadCharges()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'خطا در صدور شارژ')
    } finally {
      setBusy(false)
    }
  }

  const summary = useMemo(() => {
    let paid = 0
    let debt = 0
    let pending = 0
    for (const b of charges) {
      const a = Number(b.amount || 0)
      if (isBillPaid(b.status)) paid += a
      else if (isBillPending(b.status)) pending += a
      else debt += a
    }
    return { total: charges.length, paid, debt, pending }
  }, [charges])

  // group recent charges by title
  const byTitle = useMemo(() => {
    const m = new Map()
    for (const b of charges) {
      const t = b.title || 'شارژ'
      if (!m.has(t)) {
        m.set(t, { title: t, count: 0, amount: Number(b.amount || 0), paid: 0, debt: 0, created_at: b.created_at })
      }
      const row = m.get(t)
      row.count += 1
      if (isBillPaid(b.status)) row.paid += Number(b.amount || 0)
      else if (isBillUnpaid(b.status)) row.debt += Number(b.amount || 0)
      if (b.created_at && (!row.created_at || b.created_at > row.created_at)) row.created_at = b.created_at
    }
    return Array.from(m.values()).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  }, [charges])

  const formatDate = (iso) => {
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

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center border-2 border-indigo-200">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="panel-title text-lg">صدور و دریافت شارژ</h2>
            <p className="text-xs font-semibold text-slate-600">
              تولید شارژ ماهیانه بلوک و ارسال برای همه ساکنین (مثل قبض)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadCharges}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
          بروزرسانی
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Chip label="شارژ صادرشده" value={summary.total.toLocaleString('fa-IR')} />
        <Chip label="پرداخت‌شده" value={money(summary.paid)} tone="paid" />
        <Chip label="در انتظار" value={money(summary.pending)} tone="pending" />
        <Chip label="بدهی شارژ" value={money(summary.debt)} tone="debt" />
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

      <form onSubmit={submit} className="panel-card rounded-2xl border-2 border-violet-200 p-4 space-y-3.5">
        <p className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Send className="w-4 h-4 text-violet-600" />
          صدور شارژ ماهیانه جدید
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="field-label text-xs mb-1.5 block inline-flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              ماه شارژ
            </span>
            <input
              className="field-input"
              value={monthLabel}
              onChange={(e) => setMonthLabel(e.target.value)}
              placeholder="مثلاً فروردین ۱۴۰۵"
              required
            />
          </label>
          <label className="block">
            <span className="field-label text-xs mb-1.5 block inline-flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" />
              مبلغ هر واحد (تومان)
            </span>
            <input
              className="field-input dir-ltr"
              value={amount}
              onChange={(e) => setAmount(toEnglishDigits(e.target.value))}
              placeholder="مثلاً 500000"
              inputMode="numeric"
              required
            />
            {amountWords && (
              <p className="text-[11px] font-bold text-violet-700 mt-1">{amountWords}</p>
            )}
          </label>
        </div>

        <div className="space-y-2">
          <p className="field-label text-xs">محدوده ارسال</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-black inline-flex items-center justify-center gap-2 ${
                scope === 'all'
                  ? 'border-violet-500 bg-violet-50 text-violet-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Users className="w-4 h-4" />
              همه ساکنین مجتمع
            </button>
            <button
              type="button"
              onClick={() => setScope('blocks')}
              className={`rounded-xl border-2 px-3 py-2.5 text-sm font-black inline-flex items-center justify-center gap-2 ${
                scope === 'blocks'
                  ? 'border-violet-500 bg-violet-50 text-violet-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              انتخاب بلوک‌ها
            </button>
          </div>
        </div>

        {scope === 'blocks' && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={selectAllBlocks}>
                انتخاب همه
              </button>
              <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={clearBlocks}>
                پاک کردن
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {blocks.map((b) => {
                const k = blockKey(b)
                const checked = selectedBlocks.has(k)
                const count = (residents || []).filter(
                  (r) => blockKey(r) === k && r.status !== 'blocked',
                ).length
                return (
                  <label
                    key={k}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold cursor-pointer ${
                      checked ? 'border-violet-400 bg-white' : 'border-slate-200 bg-white/70'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleBlock(b)} />
                    <span className="min-w-0">
                      بلوک {b.block_number} {b.block_direction}
                      <span className="block text-[10px] text-slate-500 font-semibold truncate">
                        {b.full_name} — {count.toLocaleString('fa-IR')} واحد
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <label className="block">
          <span className="field-label text-xs mb-1.5 block">توضیح (اختیاری)</span>
          <textarea
            className="field-input min-h-[72px] resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثلاً شارژ نگهداری و خدمات عمومی"
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
          />
          اگر برای واحدی همین عنوان شارژ قبلاً صادر شده، دوباره نفرست
        </label>

        <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2.5 text-xs font-bold text-violet-950 leading-6">
          عنوان قبض برای ساکن: <strong>شارژ ماهیانه بلوک — {monthLabel || '…'}</strong>
          <br />
          تعداد واحد هدف:{' '}
          <strong>{targetResidents.length.toLocaleString('fa-IR')}</strong>
          {amount && Number(toEnglishDigits(amount).replace(/[^\d.]/g, '')) > 0 && (
            <>
              {' '}
              | جمع کل تقریبی:{' '}
              <strong>
                {money(
                  targetResidents.length *
                    Number(toEnglishDigits(amount).replace(/[^\d.]/g, '')),
                )}
              </strong>
            </>
          )}
          <br />
          پس از صدور، در بخش «رسید» پنل هر ساکن ظاهر می‌شود تا تصویر پرداخت را بفرستد.
        </div>

        <button type="submit" disabled={busy} className="btn-admin !mt-0 w-full inline-flex items-center justify-center gap-2">
          <Send className="w-4 h-4" />
          {busy
            ? 'در حال صدور و ارسال...'
            : `صدور و ارسال برای ${targetResidents.length.toLocaleString('fa-IR')} واحد`}
        </button>
      </form>

      {/* تاریخچه صدورهای گروهی */}
      <div className="sheet-frame">
        <div className="sheet-titlebar">
          <span>سری‌های صادرشده شارژ ماهیانه</span>
          <span className="text-[11px]">{byTitle.length.toLocaleString('fa-IR')} سری</span>
        </div>
        {loadingList ? (
          <div className="flex justify-center py-12">
            <div className="w-9 h-9 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : byTitle.length === 0 ? (
          <div className="text-center py-12 text-sky-800 font-semibold text-sm">
            هنوز شارژ ماهیانه‌ای صادر نشده است
          </div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="sheet-table w-full text-sm">
              <thead>
                <tr>
                  <th>عنوان / ماه</th>
                  <th>تعداد واحد</th>
                  <th>مبلغ واحد</th>
                  <th>پرداخت‌شده</th>
                  <th>بدهی</th>
                  <th>آخرین صدور</th>
                </tr>
              </thead>
              <tbody>
                {byTitle.map((row) => (
                  <tr key={row.title}>
                    <td className="cell-name font-extrabold text-slate-900">{row.title}</td>
                    <td className="cell-num font-bold">{row.count.toLocaleString('fa-IR')}</td>
                    <td className="cell-num font-bold">
                      {Number(row.amount || 0).toLocaleString('fa-IR')}
                    </td>
                    <td className="cell-num font-extrabold text-emerald-700">
                      {Number(row.paid || 0).toLocaleString('fa-IR')}
                    </td>
                    <td className="cell-num font-extrabold text-rose-700">
                      {Number(row.debt || 0).toLocaleString('fa-IR')}
                    </td>
                    <td className="cell-name text-xs whitespace-nowrap">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نمونه ردیف‌های اخیر */}
      {charges.length > 0 && (
        <div className="sheet-frame">
          <div className="sheet-titlebar">
            <span>آخرین شارژهای ارسال‌شده به واحدها</span>
            <span className="text-[11px]">نمایش ۵۰ مورد</span>
          </div>
          <div className="overflow-x-auto bg-white max-h-80">
            <table className="sheet-table w-full text-sm">
              <thead>
                <tr>
                  <th>واحد</th>
                  <th>بلوک</th>
                  <th>عنوان</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {charges.slice(0, 50).map((b) => (
                  <tr key={b.id}>
                    <td className="cell-unit font-extrabold">{b.unit_name}</td>
                    <td className="cell-name text-xs">
                      {b.block_number} {b.block_direction}
                    </td>
                    <td className="cell-name">{b.title}</td>
                    <td className="cell-num font-bold">
                      {Number(b.amount || 0).toLocaleString('fa-IR')}
                    </td>
                    <td>
                      <span className={billStatusClass(b.status)}>{billStatusLabel(b.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ label, value, tone = '' }) {
  const toneCls =
    tone === 'paid'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'debt'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : tone === 'pending'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-violet-200 bg-violet-50 text-violet-950'
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneCls}`}>
      <p className="text-[10px] font-bold opacity-80 mb-0.5">{label}</p>
      <p className="text-xs sm:text-sm font-black leading-snug break-words">{value}</p>
    </div>
  )
}
