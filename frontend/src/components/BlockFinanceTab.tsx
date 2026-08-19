import { useEffect, useState } from 'react'
import {
  Landmark,
  AlertCircle,
  RefreshCw,
  Wallet,
  TrendingDown,
  HandCoins,
  PiggyBank,
} from 'lucide-react'
import { sortFinanceDebtFirst } from '../lib/billStatus'
import type { PanelUser } from '../types'

function money(n) {
  return `${Number(n || 0).toLocaleString('fa-IR')} تومان`
}

export default function BlockFinanceTab({ user }: { user: PanelUser }) {
  const [rows, setRows] = useState<any[]>([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const params = new URLSearchParams({
        block_number: user.block_number,
        block_direction: user.block_direction,
      })
      const res = await fetch(`/api/block-finance?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت وضعیت مالی بلوک')
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setSummary(data.summary || null)
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.block_number, user.block_direction])

  const sortedRows = sortFinanceDebtFirst(rows)

  const totalReceived = summary?.total_received ?? summary?.total_paid_amount ?? 0
  const totalExpenses = summary?.total_expenses ?? 0
  const totalDebt = summary?.total_debt ?? 0
  const fundBalance = summary?.fund_balance ?? totalReceived - totalExpenses

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-[#0b3b66] flex items-center justify-center border border-[#1e5f96]">
            <Landmark className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-[#0b3b66]">وضعیت مالی بلوک</h2>
            <p className="text-xs font-semibold text-slate-600">
              بلوک {user.block_number} {user.block_direction}
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
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* گزارش نهایی — خلاصه صندوق */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <SummaryCard
          icon={HandCoins}
          label="جمع دریافتی از ساکنین"
          value={money(totalReceived)}
          tone="emerald"
        />
        <SummaryCard
          icon={TrendingDown}
          label="جمع خرج‌کرد مدیر"
          value={money(totalExpenses)}
          tone="rose"
        />
        <SummaryCard
          icon={Wallet}
          label="طلب از ساکنین"
          value={money(totalDebt)}
          tone="amber"
        />
        <SummaryCard
          icon={PiggyBank}
          label="موجودی صندوق ذخیره"
          value={money(fundBalance)}
          tone={fundBalance >= 0 ? 'sky' : 'rose'}
        />
      </div>
      <p className="text-[11px] font-bold text-slate-600 leading-5 px-0.5">
        موجودی صندوق = دریافتی از ساکنین − خرج‌کرد مدیر. طلب = قبض‌های پرداخت‌نشده و در انتظار تایید.
      </p>

      <div className="sheet-frame">
        <div className="sheet-titlebar">
          <span>جدول وضعیت مالی واحدها</span>
          <span className="opacity-90 text-[11px] font-semibold">شفاف‌سازی عمومی بلوک</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-14 bg-white">
            <div className="w-9 h-9 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>واحد</th>
                  <th>ساکن</th>
                  <th>پرداخت‌شده</th>
                  <th>بدهی</th>
                  <th>در انتظار</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-slate-500 font-semibold">
                      داده‌ای نیست
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r) => (
                    <tr key={r.unit_name}>
                      <td className="cell-unit">{r.unit_name}</td>
                      <td className="cell-name">{r.resident_name}</td>
                      <td className="cell-num cell-paid">
                        {Number(r.paid_amount || 0).toLocaleString('fa-IR')}
                      </td>
                      <td className="cell-num cell-debt">
                        {Number(r.debt_amount || 0).toLocaleString('fa-IR')}
                      </td>
                      <td className="cell-num">
                        {Number(r.pending_amount || 0).toLocaleString('fa-IR')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="foot-label">
                    جمع
                  </td>
                  <td className="cell-num cell-paid">
                    {Number(totalReceived).toLocaleString('fa-IR')}
                  </td>
                  <td className="cell-num cell-debt">
                    {Number(totalDebt).toLocaleString('fa-IR')}
                  </td>
                  <td className="cell-num">
                    {Number(summary?.total_pending || 0).toLocaleString('fa-IR')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, tone = 'sky' }) {
  const tones = {
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    rose: 'border-rose-300 bg-rose-50 text-rose-950',
    amber: 'border-amber-300 bg-amber-50 text-amber-950',
    sky: 'border-sky-300 bg-sky-50 text-sky-950',
  }
  return (
    <div className={`rounded-2xl border-2 px-3 py-3 ${tones[tone] || tones.sky}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-90 mb-1">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="leading-tight">{label}</span>
      </div>
      <p className="text-sm sm:text-base font-black leading-snug break-words">{value}</p>
    </div>
  )
}
