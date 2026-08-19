import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wallet,
  AlertCircle,
  RefreshCw,
  Building2,
  ArrowRight,
  Receipt,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import { isBillPaid, isBillPending, isBillUnpaid } from '../lib/billStatus'
import BlockFinanceTab from './BlockFinanceTab'
import ManagerBillsTools from './ManagerBillsTools'
import type { AdminUser, ChangedHandler, Resident } from '../types'

function blockKeyOf(b) {
  const n = onlyDigits(b?.block_number) || toEnglishDigits(b?.block_number || '')
  return `${n}|${String(b?.block_direction || '')}`
}

function sameBlock(a, b) {
  return blockKeyOf(a) === blockKeyOf(b)
}

function money(n) {
  return `${Number(n || 0).toLocaleString('fa-IR')} تومان`
}

/**
 * امور مالی مدیر مجتمع:
 * هر بلوک یک ردیف — نام بلوک، مدیر، تعداد قبض صادرشده، مبلغ پرداخت‌شده، بدهی
 * لمس ردیف → ریز مالی همان بلوک
 */
export default function ComplexFinanceBlocks({
  admin,
  blockManagers = [],
  residents = [],
  onEnterBlock,
}: {
  admin: AdminUser
  blockManagers?: AdminUser[]
  residents?: Resident[]
  onEnterBlock?: (manager: AdminUser) => void
}) {
  const [bills, setBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null) // block manager row
  const [detailTab, setDetailTab] = useState('status') // status | bills

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/bills')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت قبض‌ها')
      setBills(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => {
    // ensure every known block appears
    const map = new Map()

    const ensure = (block_number, block_direction, full_name?) => {
      const key = blockKeyOf({ block_number, block_direction })
      if (!map.has(key)) {
        map.set(key, {
          key,
          block_number,
          block_direction,
          full_name: full_name || `مدیر بلوک ${block_number} ${block_direction}`,
          bills_count: 0,
          paid_amount: 0,
          pending_amount: 0,
          debt_amount: 0,
          total_amount: 0,
        })
      }
      return map.get(key)
    }

    for (const bm of blockManagers || []) {
      ensure(bm.block_number, bm.block_direction, bm.full_name)
    }

    // also from residents if any block missing manager
    for (const r of residents || []) {
      ensure(r.block_number, r.block_direction)
    }

    for (const bill of bills || []) {
      const row = ensure(bill.block_number, bill.block_direction)
      const amt = Number(bill.amount || 0)
      row.bills_count += 1
      row.total_amount += amt
      if (isBillPaid(bill.status)) row.paid_amount += amt
      else if (isBillPending(bill.status)) row.pending_amount += amt
      else if (isBillUnpaid(bill.status)) row.debt_amount += amt
      else row.debt_amount += amt
    }

    return Array.from(map.values()).sort((a, b) => {
      const an = Number(onlyDigits(a.block_number) || 0)
      const bn = Number(onlyDigits(b.block_number) || 0)
      if (an !== bn) return an - bn
      return String(a.block_direction).localeCompare(String(b.block_direction), 'fa')
    })
  }, [bills, blockManagers, residents])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.bills += r.bills_count
        acc.paid += r.paid_amount
        acc.debt += r.debt_amount
        acc.pending += r.pending_amount
        return acc
      },
      { bills: 0, paid: 0, debt: 0, pending: 0 },
    )
  }, [rows])

  const openBlock = (row) => {
    const bm =
      (blockManagers || []).find((x) => sameBlock(x, row)) || {
        block_number: row.block_number,
        block_direction: row.block_direction,
        full_name: row.full_name,
      }
    setSelected(bm)
    setDetailTab('status')
    onEnterBlock?.(bm)
  }

  if (selected) {
    const blockResidents = (residents || []).filter((r) => sameBlock(r, selected))
    return (
      <div className="space-y-4" dir="rtl">
        <button
          type="button"
          className="btn-ghost !py-2 inline-flex items-center gap-1.5 text-sm"
          onClick={() => setSelected(null)}
        >
          <ArrowRight className="w-4 h-4" />
          بازگشت به لیست مالی بلوک‌ها
        </button>

        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3">
          <p className="font-black text-emerald-950 text-sm">
            ریز مالی — بلوک {selected.block_number} {selected.block_direction}
          </p>
          <p className="text-xs font-bold text-emerald-800 mt-0.5">
            مدیر: {selected.full_name || '—'}
          </p>
        </div>

        <div className="panel-tabs grid-cols-2">
          <button
            type="button"
            className={`panel-tab ${detailTab === 'status' ? 'panel-tab-active' : ''}`}
            onClick={() => setDetailTab('status')}
          >
            <Wallet className="w-4 h-4" />
            وضعیت مالی واحدها
          </button>
          <button
            type="button"
            className={`panel-tab ${detailTab === 'bills' ? 'panel-tab-active' : ''}`}
            onClick={() => setDetailTab('bills')}
          >
            <Receipt className="w-4 h-4" />
            قبض‌ها / صدور
          </button>
        </div>

        {detailTab === 'status' && (
          <BlockFinanceTab
            user={{
              unit_name: '',
              block_number: selected.block_number,
              block_direction: selected.block_direction,
            }}
          />
        )}

        {detailTab === 'bills' && (
          <ManagerBillsTools
            admin={{
              ...selected,
              role: 'complex_manager',
              full_name: admin?.full_name || selected.full_name,
            }}
            residents={blockResidents}
            onChanged={load}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-800 flex items-center justify-center border-2 border-indigo-200">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="panel-title text-lg">امور مالی بلوک‌ها</h2>
            <p className="text-xs font-semibold text-slate-600">
              هر ردیف یک بلوک — لمس کنید تا ریز مالی را ببینید
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryChip label="کل قبض صادرشده" value={totals.bills.toLocaleString('fa-IR')} />
        <SummaryChip label="پرداخت‌شده" value={money(totals.paid)} tone="paid" />
        <SummaryChip label="در انتظار تایید" value={money(totals.pending)} tone="pending" />
        <SummaryChip label="بدهی" value={money(totals.debt)} tone="debt" />
      </div>

      <div className="sheet-frame overflow-hidden">
        <div className="sheet-titlebar">
          <span>جدول مالی بلوک‌ها</span>
          <span className="text-[11px]">{rows.length.toLocaleString('fa-IR')} بلوک</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-14 text-sky-800 font-semibold text-sm">
            بلوکی برای نمایش مالی یافت نشد
          </div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="sheet-table w-full text-sm">
              <thead>
                <tr>
                  <th className="col-index">#</th>
                  <th>نام بلوک</th>
                  <th>نام مدیر بلوک</th>
                  <th>قبض‌های صادرشده</th>
                  <th>مبلغ پرداخت‌شده</th>
                  <th>بدهی</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr
                    key={r.key}
                    className="cursor-pointer hover:bg-emerald-50/80 transition-colors"
                    onClick={() => openBlock(r)}
                    title="لمس برای مشاهده ریز مالی"
                  >
                    <td className="col-index">{(idx + 1).toLocaleString('fa-IR')}</td>
                    <td className="cell-unit font-black">
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                        {r.block_number} {r.block_direction}
                      </span>
                    </td>
                    <td className="cell-name font-bold text-slate-800">{r.full_name || '—'}</td>
                    <td className="cell-num font-extrabold text-slate-600">
                      {r.bills_count.toLocaleString('fa-IR')}
                    </td>
                    <td className="cell-num font-extrabold text-emerald-700">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        {Number(r.paid_amount || 0).toLocaleString('fa-IR')}
                      </span>
                    </td>
                    <td className="cell-num font-extrabold text-rose-700">
                      <span className="inline-flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 shrink-0" />
                        {Number(r.debt_amount || 0).toLocaleString('fa-IR')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-sky-50 font-black">
                  <td colSpan={3} className="px-3 py-2.5 text-sky-950">
                    جمع کل
                  </td>
                  <td className="cell-num">{totals.bills.toLocaleString('fa-IR')}</td>
                  <td className="cell-num text-emerald-700">
                    {Number(totals.paid).toLocaleString('fa-IR')}
                  </td>
                  <td className="cell-num text-rose-700">
                    {Number(totals.debt).toLocaleString('fa-IR')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] font-bold text-slate-600 leading-6">
        مبالغ به تومان است. بدهی = قبض‌های پرداخت‌نشده. با لمس هر ردیف، وضعیت مالی واحدهای همان بلوک و
        لیست قبض‌ها نمایش داده می‌شود.
      </p>
    </div>
  )
}

function SummaryChip({ label, value, tone = '' }) {
  const toneCls =
    tone === 'paid'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : tone === 'debt'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : tone === 'pending'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-sky-200 bg-sky-50 text-sky-950'
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneCls}`}>
      <p className="text-[10px] font-bold opacity-80 mb-0.5">{label}</p>
      <p className="text-xs sm:text-sm font-black leading-snug break-words">{value}</p>
    </div>
  )
}
