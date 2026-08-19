import { useEffect, useMemo, useState } from 'react'
import {
  Table2,
  AlertCircle,
  RefreshCw,
  Download,
  Filter,
  FileSpreadsheet,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import {
  isBillPaid,
  isBillPending,
  isBillUnpaid,
  billStatusLabel,
  billStatusClass,
  sortBillsUnpaidFirst,
} from '../lib/billStatus'
import type { AdminUser, Resident } from '../types'

const ATTACH_RE = /\[\[attach:([^\]]+)\]\]/i
const RECEIPT_AT_RE = /\[\[at:([^\]]*)\]\]/i

function parseReceiptAt(desc) {
  const m = String(desc || '').match(RECEIPT_AT_RE)
  return m ? String(m[1] || '').trim() : ''
}

function formatFaDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return '—'
  }
}

function formatMoney(n) {
  return `${Number(n || 0).toLocaleString('fa-IR')} تومان`
}

function escXml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sameBlock(a, b) {
  const da = onlyDigits(a) || toEnglishDigits(a || '')
  const db = onlyDigits(b) || toEnglishDigits(b || '')
  if (da && db) return da === db
  return String(a || '') === String(b || '')
}

function downloadReportExcel({ rows, admin, filtersLabel }) {
  const headers = [
    'شماره واحد',
    'طبقه',
    'نام ساکن',
    'عنوان قبض',
    'مبلغ قبض',
    'تاریخ دریافت قبض',
    'تاریخ ارسال رسید',
    'تاریخ تایید قبض',
    'وضعیت قبض',
  ]

  const dataXml = rows
    .map((r, idx) => {
      const zebra = idx % 2 === 0 ? 'sRowA' : 'sRowB'
      const st =
        r.statusKey === 'paid' ? 'sPaid' : r.statusKey === 'pending' ? 'sPending' : 'sUnpaid'
      return `
    <Row ss:AutoFitHeight="1" ss:Height="26">
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.unit_name)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.floor)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.resident_name)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.title)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.amountLabel)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.received_at)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.receipt_sent_at)}</Data></Cell>
      <Cell ss:StyleID="${zebra}"><Data ss:Type="String">${escXml(r.approved_at)}</Data></Cell>
      <Cell ss:StyleID="${st}"><Data ss:Type="String">${escXml(r.statusLabel)}</Data></Cell>
    </Row>`
    })
    .join('')

  const nowLabel = new Date().toLocaleString('fa-IR')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="11" ss:Color="#0F172A"/>
  </Style>
  <Style ss:ID="sTitle">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="15" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0369A1" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sSub">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#0C4A6E"/>
   <Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sHead">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0B3B66" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sRowA">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="10"/>
   <Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="sRowB">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="10"/>
   <Interior ss:Color="#F0F9FF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="sPaid">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#14532D"/>
   <Interior ss:Color="#BBF7D0" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sPending">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#92400E"/>
   <Interior ss:Color="#FDE68A" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="sUnpaid">
   <Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:ReadingOrder="RightToLeft"/>
   <Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1" ss:Color="#9F1239"/>
   <Interior ss:Color="#FECDD3" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="جدول واحدها" ss:RightToLeft="1">
  <Table ss:ExpandedColumnCount="9" ss:ExpandedRowCount="${rows.length + 4}" x:FullColumns="1" x:FullRows="1">
   <Column ss:Index="1" ss:AutoFitWidth="0" ss:Width="80"/>
   <Column ss:Index="2" ss:AutoFitWidth="0" ss:Width="60"/>
   <Column ss:Index="3" ss:AutoFitWidth="0" ss:Width="110"/>
   <Column ss:Index="4" ss:AutoFitWidth="0" ss:Width="130"/>
   <Column ss:Index="5" ss:AutoFitWidth="0" ss:Width="110"/>
   <Column ss:Index="6" ss:AutoFitWidth="0" ss:Width="100"/>
   <Column ss:Index="7" ss:AutoFitWidth="0" ss:Width="100"/>
   <Column ss:Index="8" ss:AutoFitWidth="0" ss:Width="100"/>
   <Column ss:Index="9" ss:AutoFitWidth="0" ss:Width="110"/>
   <Row ss:Height="32">
    <Cell ss:MergeAcross="8" ss:StyleID="sTitle"><Data ss:Type="String">گزارش قبض و واحدها — بلوک ${escXml(admin?.block_number)} ${escXml(admin?.block_direction)}</Data></Cell>
   </Row>
   <Row ss:Height="24">
    <Cell ss:MergeAcross="8" ss:StyleID="sSub"><Data ss:Type="String">${escXml(filtersLabel)} | خروجی: ${escXml(nowLabel)} | تعداد: ${rows.length.toLocaleString('fa-IR')}</Data></Cell>
   </Row>
   <Row ss:Height="8"/>
   <Row ss:Height="30">
    ${headers.map((h) => `<Cell ss:StyleID="sHead"><Data ss:Type="String">${escXml(h)}</Data></Cell>`).join('')}
   </Row>
   ${dataXml}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup>
    <Layout x:Orientation="Landscape" x:RightToLeft="1"/>
   </PageSetup>
   <DisplayRightToLeft/>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`

  const blob = new Blob(['\uFEFF' + xml], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `گزارش-واحدها-بلوک-${toEnglishDigits(admin?.block_number || '')}-${admin?.block_direction || ''}.xls`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ManagerUnitsReport({
  admin,
  residents = [],
}: {
  admin: AdminUser
  residents?: Resident[]
}) {
  const [bills, setBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('all') // all | unpaid | pending | paid
  const [filterUnit, setFilterUnit] = useState('')
  const [filterTitle, setFilterTitle] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)

  const load = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      // همه قبض‌ها را بگیر و سمت کلاینت فیلتر بلوک کن (پایدارتر از query)
      const res = await fetch('/api/bills')
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error((data && data.error) || 'خطا در دریافت قبض‌ها')
      const list = Array.isArray(data) ? data : []
      const filtered = admin
        ? list.filter((b) => {
            const sameBn = sameBlock(b.block_number, admin.block_number)
            const bd = String(admin.block_direction || '')
            const bbd = String(b.block_direction || '')
            const sameBd = !bd || !bbd || bbd === bd
            return sameBn && sameBd
          })
        : list
      setBills(filtered)
    } catch (err) {
      if (!silent) {
        setError(err.message || 'خطا')
        setBills([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (!admin) {
      setLoading(false)
      return
    }
    load({ silent: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.block_number, admin?.block_direction, admin?.id])

  const residentByUnit = useMemo(() => {
    const map: Record<string, Resident> = {}
    for (const r of residents || []) {
      if (!r?.unit_name) continue
      if (admin) {
        const sameBn = sameBlock(r.block_number, admin.block_number)
        const bd = String(admin.block_direction || '')
        const rbd = String(r.block_direction || '')
        const sameBd = !bd || !rbd || rbd === bd
        if (!sameBn || !sameBd) continue
      }
      map[String(r.unit_name)] = r
      // کلید نرمال‌شده با ارقام انگلیسی
      const en = toEnglishDigits(String(r.unit_name))
      if (en && !map[en]) map[en] = r
    }
    return map
  }, [residents, admin])

  const unitOptions = useMemo(() => {
    const set = new Set<string>()
    for (const b of bills) if (b.unit_name) set.add(String(b.unit_name))
    for (const u of Object.keys(residentByUnit)) set.add(u)
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'fa'))
  }, [bills, residentByUnit])

  const rows = useMemo(() => {
    try {
      const sorted = sortBillsUnpaidFirst(Array.isArray(bills) ? bills : [])
      const mapped = sorted.map((b) => {
        const r =
          residentByUnit[String(b.unit_name)] ||
          residentByUnit[toEnglishDigits(String(b.unit_name || ''))] ||
          {} as Resident
        const paid = isBillPaid(b.status)
        const pending = isBillPending(b.status)
        const receiptAtRaw =
          b.receipt_at || parseReceiptAt(b.description) || (pending ? b.paid_at : '')
        const approvedAt = paid ? b.paid_at || parseReceiptAt(b.description) : ''
        let received_ts = 0
        if (b.created_at) {
          const t = new Date(b.created_at).getTime()
          received_ts = Number.isFinite(t) ? t : 0
        }
        return {
          id: b.id,
          unit_name: b.unit_name || '—',
          floor: r.floor || '—',
          resident_name:
            `${r.first_name || ''} ${r.last_name || ''}`.trim() || b.unit_name || '—',
          title: b.title || '—',
          amount: Number(b.amount || 0),
          amountLabel: formatMoney(b.amount),
          received_at: formatFaDate(b.created_at),
          received_ts,
          receipt_sent_at: formatFaDate(receiptAtRaw),
          approved_at: formatFaDate(approvedAt),
          status: b.status,
          statusLabel: billStatusLabel(b.status),
          statusKey: paid ? 'paid' : pending ? 'pending' : 'unpaid',
          statusClass: billStatusClass(b.status),
          hasAttach: Boolean(b.attachment_url || ATTACH_RE.test(b.description || '')),
        }
      })

      return mapped.filter((row) => {
        if (filterUnit && String(row.unit_name) !== String(filterUnit)) return false
        if (filterTitle && !String(row.title).includes(filterTitle.trim())) return false
        if (filterStatus === 'unpaid' && row.statusKey !== 'unpaid') return false
        if (filterStatus === 'pending' && row.statusKey !== 'pending') return false
        if (filterStatus === 'paid' && row.statusKey !== 'paid') return false
        // تاریخ فقط وقتی مقدار دارد و ردیف تاریخ معتبر دارد
        if (dateFrom && row.received_ts) {
          const fromTs = new Date(`${dateFrom}T00:00:00`).getTime()
          if (Number.isFinite(fromTs) && row.received_ts < fromTs) return false
        }
        if (dateTo && row.received_ts) {
          const toTs = new Date(`${dateTo}T23:59:59`).getTime()
          if (Number.isFinite(toTs) && row.received_ts > toTs) return false
        }
        return true
      })
    } catch (err) {
      console.error('rows build error', err)
      return []
    }
  }, [bills, residentByUnit, filterUnit, filterTitle, filterStatus, dateFrom, dateTo])

  const stats = useMemo(() => {
    const unpaid = rows.filter((r) => r.statusKey === 'unpaid')
    const pending = rows.filter((r) => r.statusKey === 'pending')
    const paid = rows.filter((r) => r.statusKey === 'paid')
    const sum = (arr) => arr.reduce((a, r) => a + Number(r.amount || 0), 0)
    return {
      total: rows.length,
      unpaid: unpaid.length,
      pending: pending.length,
      paid: paid.length,
      unpaidSum: sum(unpaid),
      pendingSum: sum(pending),
      paidSum: sum(paid),
    }
  }, [rows])

  const filtersLabel = useMemo(() => {
    const parts: string[] = []
    if (filterStatus === 'unpaid') parts.push('وضعیت: پرداخت‌نشده')
    else if (filterStatus === 'pending') parts.push('وضعیت: در انتظار تایید')
    else if (filterStatus === 'paid') parts.push('وضعیت: پرداخت‌شده')
    else parts.push('وضعیت: همه')
    if (filterUnit) parts.push(`واحد: ${filterUnit}`)
    if (filterTitle) parts.push(`عنوان: ${filterTitle}`)
    if (dateFrom) parts.push(`از: ${dateFrom}`)
    if (dateTo) parts.push(`تا: ${dateTo}`)
    return parts.join(' | ')
  }, [filterStatus, filterUnit, filterTitle, dateFrom, dateTo])

  const clearFilters = () => {
    setFilterStatus('all')
    setFilterUnit('')
    setFilterTitle('')
    setDateFrom('')
    setDateTo('')
  }

  const exportExcel = () => {
    downloadReportExcel({ rows, admin, filtersLabel })
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Table2 className="w-5 h-5 text-sky-700" />
          <div>
            <h2 className="panel-title text-lg">جدول واحدها و قبض‌ها</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              هر ردیف = یک قبض — اولویت با پرداخت‌نشده
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-black px-3 py-2"
          >
            <Download className="w-3.5 h-3.5" />
            خروجی اکسل
          </button>
          <button
            type="button"
            onClick={() => load({ silent: false })}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-800 hover:text-sky-950"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            بروزرسانی
          </button>
        </div>
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* تب فیلتر — به‌صورت پیش‌فرض مخفی */}
      <div className="panel-card rounded-2xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setFilterOpen((v) => !v)}
          className={`w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-black transition-colors ${
            filterOpen ? 'bg-sky-100 text-sky-950' : 'bg-white text-sky-950 hover:bg-sky-50'
          }`}
          aria-expanded={filterOpen}
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="w-4 h-4 text-sky-700" />
            فیلتر
            {(filterStatus !== 'all' || filterUnit || filterTitle || dateFrom || dateTo) && (
              <span className="text-[10px] font-black rounded-full bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200 px-2 py-0.5">
                فعال
              </span>
            )}
          </span>
          <span className="text-xs font-bold text-sky-700">{filterOpen ? '▲ بستن' : '▼ نمایش'}</span>
        </button>

        {filterOpen && (
          <div className="p-4 pt-3 border-t border-sky-200 space-y-3 bg-sky-50/40">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">وضعیت قبض</span>
                <select
                  className="field-input"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="all">همه</option>
                  <option value="unpaid">پرداخت‌نشده</option>
                  <option value="pending">در انتظار تایید</option>
                  <option value="paid">پرداخت‌شده</option>
                </select>
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">شماره واحد</span>
                <select
                  className="field-input"
                  value={filterUnit}
                  onChange={(e) => setFilterUnit(e.target.value)}
                >
                  <option value="">همه واحدها</option>
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">عنوان قبض</span>
                <input
                  className="field-input"
                  value={filterTitle}
                  onChange={(e) => setFilterTitle(e.target.value)}
                  placeholder="جستجو در عنوان..."
                />
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">از تاریخ دریافت</span>
                <input
                  type="date"
                  className="field-input dir-ltr"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">تا تاریخ دریافت</span>
                <input
                  type="date"
                  className="field-input dir-ltr"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-full rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-sm py-2.5 hover:bg-slate-50"
                >
                  پاک کردن فیلترها
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* آمار خلاصه */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="stat-card">
          <p className="stat-label">تعداد ردیف</p>
          <p className="stat-value">{stats.total.toLocaleString('fa-IR')}</p>
        </div>
        <div className="stat-card !border-rose-300">
          <p className="stat-label text-rose-700">پرداخت‌نشده</p>
          <p className="stat-value !text-sm text-rose-700">
            {stats.unpaid.toLocaleString('fa-IR')}
            <span className="block text-[11px] font-bold mt-0.5">{formatMoney(stats.unpaidSum)}</span>
          </p>
        </div>
        <div className="stat-card !border-amber-300">
          <p className="stat-label text-amber-800">در انتظار</p>
          <p className="stat-value !text-sm text-amber-800">
            {stats.pending.toLocaleString('fa-IR')}
            <span className="block text-[11px] font-bold mt-0.5">{formatMoney(stats.pendingSum)}</span>
          </p>
        </div>
        <div className="stat-card !border-emerald-300">
          <p className="stat-label text-emerald-700">پرداخت‌شده</p>
          <p className="stat-value !text-sm text-emerald-700">
            {stats.paid.toLocaleString('fa-IR')}
            <span className="block text-[11px] font-bold mt-0.5">{formatMoney(stats.paidSum)}</span>
          </p>
        </div>
      </div>

      <div className="sheet-frame finance-report-frame">
        <div className="sheet-titlebar">
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4" />
            جدول گزارش
          </span>
          <span className="text-[11px] opacity-90">{filtersLabel}</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 bg-white">
            <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="sheet-table finance-report-table manager-units-report-table">
              <thead>
                <tr>
                  <th className="th-wrap">
                    <span className="th-label">شماره واحد</span>
                  </th>
                  <th className="th-nowrap">
                    <span className="th-label">طبقه</span>
                  </th>
                  <th className="th-nowrap">
                    <span className="th-label">نام ساکن</span>
                  </th>
                  <th className="th-wrap">
                    <span className="th-label">عنوان قبض</span>
                  </th>
                  <th className="th-wrap">
                    <span className="th-label">مبلغ قبض</span>
                  </th>
                  <th className="th-wrap">
                    <span className="th-label">تاریخ دریافت قبض</span>
                  </th>
                  <th className="th-wrap">
                    <span className="th-label">تاریخ ارسال رسید</span>
                  </th>
                  <th className="th-wrap">
                    <span className="th-label">تاریخ تایید قبض</span>
                  </th>
                  <th className="th-wrap">
                    <span className="th-label">وضعیت قبض</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-500 font-semibold">
                      {bills.length === 0
                        ? 'قبضی برای این بلوک ثبت نشده است'
                        : 'موردی با این فیلتر یافت نشد'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        r.statusKey === 'paid'
                          ? 'row-paid'
                          : r.statusKey === 'pending'
                            ? 'row-pending'
                            : 'row-unpaid'
                      }
                    >
                      <td className="cell-unit">
                        <span className="cell-clip">{r.unit_name}</span>
                      </td>
                      <td className="cell-unit">
                        <span className="cell-clip">{r.floor}</span>
                      </td>
                      <td className="cell-name">
                        <span className="cell-clip">{r.resident_name}</span>
                      </td>
                      <td className="cell-name">
                        <span className="cell-clip">{r.title}</span>
                      </td>
                      <td
                        className={`cell-num ${
                          r.statusKey === 'paid'
                            ? 'cell-paid'
                            : r.statusKey === 'unpaid'
                              ? 'cell-debt'
                              : ''
                        }`}
                      >
                        <span className="cell-clip">{r.amountLabel}</span>
                      </td>
                      <td className="cell-unit">
                        <span className="cell-clip">{r.received_at}</span>
                      </td>
                      <td className="cell-unit">
                        <span className="cell-clip">{r.receipt_sent_at}</span>
                      </td>
                      <td className="cell-unit">
                        <span className="cell-clip">{r.approved_at}</span>
                      </td>
                      <td className="text-center cell-status">
                        <span className={r.statusClass}>{r.statusLabel}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
