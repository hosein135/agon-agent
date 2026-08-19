import { useEffect, useMemo, useState } from 'react'
import {
  PieChart,
  AlertCircle,
  RefreshCw,
  Wallet,
  Receipt,
  CheckCircle2,
  FileSpreadsheet,
  Download,
} from 'lucide-react'

import {
  isBillPaid as isPaidStatus,
  billStatusLabel as statusLabel,
  billStatusClass,
  sortBillsUnpaidFirst,
} from '../lib/billStatus'
import { downloadResidentFinanceExcel } from '../lib/exportFinanceExcel'
import type { PanelUser } from '../types'

export default function ResidentFinance({ user }: { user: PanelUser }) {
  const [bills, setBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const params = new URLSearchParams({
        unit_name: user.unit_name,
        for_payer: '1',
      })
      if (user?.id != null) params.set('resident_id', String(user.id))
      if (user?.occupancy) params.set('occupancy', String(user.occupancy))
      const res = await fetch(`/api/bills?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت اطلاعات مالی')
      setBills(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.unit_name])

  const sortedBills = useMemo(() => sortBillsUnpaidFirst(bills), [bills])

  const stats = useMemo(() => {
    const unpaid = bills.filter((b) => !isPaidStatus(b.status))
    const paid = bills.filter((b) => isPaidStatus(b.status))
    const sum = (arr) => arr.reduce((a, b) => a + Number(b.amount || 0), 0)
    return {
      total: bills.length,
      unpaidCount: unpaid.length,
      paidCount: paid.length,
      unpaidSum: sum(unpaid),
      paidSum: sum(paid),
    }
  }, [bills])

  const money = (n) => `${Number(n || 0).toLocaleString('fa-IR')} تومان`

  const formatDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const approvalDate = (b) => {
    if (b.status !== 'پرداخت‌شده') return '—'
    return formatDate(b.paid_at)
  }

  const handleExport = () => {
    setError('')
    setExporting(true)
    try {
      downloadResidentFinanceExcel({
        bills: sortedBills,
        user,
      })
    } catch (err) {
      setError(err.message || 'خروجی اکسل ناموفق بود')
    } finally {
      setTimeout(() => setExporting(false), 400)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-[#0b3b66] flex items-center justify-center border border-[#1e5f96]">
            <PieChart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-[#0b3b66]">گزارش مالی</h2>
            <p className="text-xs font-semibold text-slate-600">واحد {user.unit_name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={loading || exporting || bills.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black shadow-sm shadow-emerald-700/20"
          >
            {exporting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4" />
            )}
            خروجی اکسل
            <Download className="w-3.5 h-3.5 opacity-90" />
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            بروزرسانی
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="stat-card">
          <p className="stat-label flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" />
            کل قبض‌ها
          </p>
          <p className="stat-value">{stats.total}</p>
        </div>
        <div className="stat-card !border-rose-300">
          <p className="stat-label flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5 text-rose-600" />
            پرداخت‌نشده
          </p>
          <p className="stat-value !text-sm leading-6 text-rose-700">{money(stats.unpaidSum)}</p>
        </div>
        <div className="stat-card !border-emerald-300">
          <p className="stat-label flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            پرداخت‌شده
          </p>
          <p className="stat-value !text-sm leading-6 text-emerald-700">{money(stats.paidSum)}</p>
        </div>
      </div>

      <div className="sheet-frame finance-report-frame">
        <div className="sheet-titlebar">
          <span>جدول گزارش مالی واحد</span>
          <span className="opacity-90 text-[11px] font-semibold">اولویت با قبض‌های پرداخت‌نشده</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 bg-white">
            <div className="w-10 h-10 border-4 border-[#0b3b66] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedBills.length === 0 ? (
          <div className="text-center py-16 text-slate-600 font-semibold bg-white">قبضی ثبت نشده است</div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="sheet-table finance-report-table">
              <colgroup>
                <col className="col-unit" />
                <col className="col-fname" />
                <col className="col-lname" />
                <col className="col-title" />
                <col className="col-amount" />
                <col className="col-recv" />
                <col className="col-approve" />
                <col className="col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th>واحد</th>
                  <th>نام ساکن</th>
                  <th>نام خانوادگی ساکن</th>
                  <th>عنوان قبض</th>
                  <th>مبلغ قبض</th>
                  <th>تاریخ دریافت قبض</th>
                  <th>تاریخ تایید قبض توسط مدیر</th>
                  <th>وضعیت قبض</th>
                </tr>
              </thead>
              <tbody>
                {sortedBills.map((b, idx) => {
                  const paid = isPaidStatus(b.status)
                  return (
                    <tr key={b.id || idx} className={paid ? 'row-paid' : 'row-unpaid'}>
                      <td className="cell-unit">
                        <span className="cell-clip">{user.unit_name || '—'}</span>
                      </td>
                      <td className="cell-name">
                        <span className="cell-clip">{user.first_name || '—'}</span>
                      </td>
                      <td className="cell-name">
                        <span className="cell-clip">{user.last_name || '—'}</span>
                      </td>
                      <td className="cell-name">
                        <span className="cell-clip">{b.title || '—'}</span>
                      </td>
                      <td className={`cell-num ${paid ? 'cell-paid' : 'cell-debt'}`}>
                        <span className="cell-clip">{money(b.amount)}</span>
                      </td>
                      <td className="cell-unit">
                        <span className="cell-clip">{formatDate(b.created_at)}</span>
                      </td>
                      <td className="cell-unit">
                        <span className="cell-clip">{approvalDate(b)}</span>
                      </td>
                      <td className="text-center cell-status">
                        <span className={billStatusClass(b.status)}>{statusLabel(b.status)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="foot-label">
                    جمع کل مبلغ
                  </td>
                  <td className="cell-num cell-paid">
                    <span className="cell-clip">{money(stats.unpaidSum + stats.paidSum)}</span>
                  </td>
                  <td colSpan={3} className="text-center text-xs font-black text-[#0b3b66]">
                    <span className="cell-clip">
                      {stats.unpaidCount.toLocaleString('fa-IR')} پرداخت‌نشده /{' '}
                      {stats.paidCount.toLocaleString('fa-IR')} پرداخت‌شده
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] font-semibold text-slate-500 leading-6 px-1">
        دکمه «خروجی اکسل» فایلی با ستون‌های: واحد، نام ساکن، نام خانوادگی، عنوان قبض، مبلغ قبض، تاریخ
        دریافت قبض، تاریخ تایید توسط مدیر و وضعیت قبض دانلود می‌کند.
      </p>
    </div>
  )
}
