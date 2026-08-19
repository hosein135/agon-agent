import { useMemo, useState } from 'react'
import {
  FileSpreadsheet,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  Columns3,
  Receipt,
  Users,
  Eye,
  Wand2,
  ChevronLeft,
  ChevronRight,
  Table2,
  Layers,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { toEnglishDigits } from '../lib/digits'
import {
  BILL_META_FIELDS,
  RESIDENT_FIELDS,
  autoMapHeaders,
  readSpreadsheetFile,
  applyColumnMap,
  validateMappedRows,
  detectBillAmountColumns,
  expandBillRowsFromSheet,
  validateExpandedBills,
  KNOWN_BILL_TITLES,
  billsPreviewToCsv,
  normalizeJalaliDateInput,
} from '../lib/excelImport'
import type { AdminUser, ChangedHandler, Resident } from '../types'

function toCsv(rows) {
  const fa = ['نام واحد', 'نام', 'نام خانوادگی', 'طبقه', 'وضعیت', 'تلفن', 'رمز', 'شماره بلوک', 'جهت بلوک']
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [fa.map(esc).join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.unit_name,
        r.first_name,
        r.last_name,
        r.floor,
        r.occupancy,
        r.phone,
        r.pin || '',
        r.block_number,
        r.block_direction,
      ]
        .map(esc)
        .join(','),
    )
  }
  return `\uFEFF${lines.join('\n')}`
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const STEPS_BILLS = [
  { id: 'upload', label: 'آپلود فایل' },
  { id: 'sheet', label: 'انتخاب شیت' },
  { id: 'map', label: 'سرستون و عناوین' },
  { id: 'preview', label: 'پیش‌نمایش و صدور' },
]

const STEPS_RESIDENTS = [
  { id: 'upload', label: 'آپلود فایل' },
  { id: 'sheet', label: 'انتخاب شیت' },
  { id: 'map', label: 'شناسایی ستون‌ها' },
  { id: 'preview', label: 'پیش‌نمایش و ثبت' },
]

export default function UnitsExcelTools({
  admin,
  residents = [],
  onImported,
  mode = 'both',
}: {
  admin: AdminUser
  residents?: Resident[]
  onImported?: ChangedHandler
  mode?: 'both' | 'bills' | 'residents' | string
}) {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  const [importKind, setImportKind] = useState('bills') // bills | residents
  const [step, setStep] = useState('upload')
  const [fileName, setFileName] = useState('')
  const [sheetNames, setSheetNames] = useState<any[]>([])
  const [activeSheet, setActiveSheet] = useState('')
  const [headers, setHeaders] = useState<any[]>([])
  const [rawRows, setRawRows] = useState<any[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [amountCols, setAmountCols] = useState<any[]>([])
  const [parser, setParser] = useState(null)
  const [defaultTitle, setDefaultTitle] = useState('بدهی قبلی (ورود از اکسل)')
  const [upsertResidents, setUpsertResidents] = useState(true)
  const [notifyResidents, setNotifyResidents] = useState(false)
  const [resultInfo, setResultInfo] = useState(null)
  const [extraAmountHeader, setExtraAmountHeader] = useState('')
  const [extraAmountTitle, setExtraAmountTitle] = useState('سایر')
  const [managerConfirmed, setManagerConfirmed] = useState(false)

  const steps = importKind === 'bills' ? STEPS_BILLS : STEPS_RESIDENTS
  const fields = importKind === 'bills' ? BILL_META_FIELDS : RESIDENT_FIELDS

  const blockResidents = useMemo(
    () =>
      residents.filter(
        (r) =>
          toEnglishDigits(r.block_number) === toEnglishDigits(admin.block_number) &&
          r.block_direction === admin.block_direction,
      ),
    [residents, admin],
  )

  const expanded = useMemo(() => {
    if (importKind !== 'bills') {
      return { bills: [], errors: [], sourceRows: 0 }
    }
    return expandBillRowsFromSheet({
      rawRows,
      metaMapping: mapping,
      amountColumns: amountCols,
      legacyTitleHeader: mapping.title || '',
      legacyAmountHeader: mapping.amount || '',
      defaultTitle,
    })
  }, [importKind, rawRows, mapping, amountCols, defaultTitle])

  const billValidation = useMemo(
    () => validateExpandedBills(expanded.bills),
    [expanded.bills],
  )

  const residentMapped = useMemo(
    () => (importKind === 'residents' ? applyColumnMap(rawRows, mapping) : []),
    [importKind, rawRows, mapping],
  )
  const residentValidation = useMemo(
    () => validateMappedRows(residentMapped, 'residents'),
    [residentMapped],
  )

  const validation = importKind === 'bills' ? billValidation : residentValidation

  const resetWizard = () => {
    setStep('upload')
    setFileName('')
    setSheetNames([])
    setActiveSheet('')
    setHeaders([])
    setRawRows([])
    setMapping({})
    setAmountCols([])
    setParser(null)
    setResultInfo(null)
    setError('')
    setSuccess('')
    setExtraAmountHeader('')
    setManagerConfirmed(false)
  }

  const exportExcel = () => {
    const csv = toCsv(
      blockResidents.map((r) => ({
        ...r,
        pin: '',
      })),
    )
    downloadBlob(
      csv,
      `units-block-${toEnglishDigits(admin.block_number)}-${admin.block_direction}.csv`,
      'text/csv;charset=utf-8;',
    )
  }

  const downloadBillTemplate = () => {
    const csv = `\uFEFF${[
      [
        'نام واحد',
        'طبقه',
        'نام',
        'نام خانوادگی',
        'قبض برق',
        'قبض آب',
        'ذخیره صندوق',
        'سایر',
        'تاریخ دریافت',
        'تاریخ پرداخت',
      ].join(','),
      ['۲', '1', 'رضا', 'مهرجو', '300', '500', '200', '', '1405/03/01', '1405/03/05'].join(','),
      ['۳', '2', 'محمد', 'براری', '250', '', '100', '50', '1405/03/01', ''].join(','),
    ].join('\n')}`
    downloadBlob(csv, 'template-bills-multi-column.csv', 'text/csv;charset=utf-8;')
  }

  const downloadResidentTemplate = () => {
    const csv = toCsv([
      {
        unit_name: 'A-101',
        first_name: 'علی',
        last_name: 'محمدی',
        floor: '1',
        occupancy: 'مالک',
        phone: '09120000000',
        pin: '1234',
        block_number: admin.block_number,
        block_direction: admin.block_direction,
      },
    ])
    downloadBlob(csv, 'template-units.csv', 'text/csv;charset=utf-8;')
  }

  const applySheet = (p, name) => {
    const { headers: h, rows } = p.parseSheet(name)
    setActiveSheet(name)
    setHeaders(h)
    setRawRows(rows)
    const auto = autoMapHeaders(h, fields)
    setMapping(auto)
    if (importKind === 'bills') {
      setAmountCols(detectBillAmountColumns(h, auto))
    } else {
      setAmountCols([])
    }
  }

  const onFile = async (file) => {
    setError('')
    setSuccess('')
    setResultInfo(null)
    if (!file) return
    setBusy(true)
    try {
      const p = await readSpreadsheetFile(file)
      setParser(p)
      setFileName(file.name)
      setSheetNames(p.sheetNames)
      setHeaders([])
      setRawRows([])
      setMapping({})
      setAmountCols([])
      setActiveSheet('')
      if (p.sheetNames.length === 1) {
        applySheet(p, p.sheetNames[0])
        setStep('map')
        setSuccess(
          `فایل «${file.name}» خوانده شد (۱ شیت: ${p.sheetNames[0]}). سرستون‌ها را بررسی کنید.`,
        )
      } else {
        setStep('sheet')
        setSuccess(
          `فایل «${file.name}» دارای ${p.sheetNames.length.toLocaleString('fa-IR')} شیت است. شیت موردنظر را انتخاب کنید.`,
        )
      }
    } catch (err) {
      setError(err.message || 'خطا در خواندن فایل')
    } finally {
      setBusy(false)
    }
  }

  const chooseSheet = (name) => {
    if (!parser) return
    setError('')
    applySheet(parser, name)
    setStep('map')
    setResultInfo(null)
    setSuccess(`شیت «${name}» انتخاب شد. سرستون‌ها بررسی و نگاشت شدند.`)
  }

  const onChangeKind = (kind) => {
    setImportKind(kind)
    setResultInfo(null)
    setSuccess('')
    setError('')
    if (parser && activeSheet) {
      const { headers: h, rows } = parser.parseSheet(activeSheet)
      setHeaders(h)
      setRawRows(rows)
      const flds = kind === 'bills' ? BILL_META_FIELDS : RESIDENT_FIELDS
      const auto = autoMapHeaders(h, flds)
      setMapping(auto)
      setAmountCols(kind === 'bills' ? detectBillAmountColumns(h, auto) : [])
    }
  }

  const setMapField = (fieldKey, header) => {
    setMapping((prev) => {
      const next = { ...prev, [fieldKey]: header }
      if (importKind === 'bills') {
        setAmountCols((cols) => {
          // re-detect keeping user toggles for same headers
          const detected = detectBillAmountColumns(headers, next)
          const prevMap = Object.fromEntries((cols || []).map((c) => [c.header, c]))
          return detected.map((d) => ({
            ...d,
            enabled: prevMap[d.header] ? prevMap[d.header].enabled : d.enabled,
            title: prevMap[d.header]?.title || d.title,
          }))
        })
      }
      return next
    })
  }

  const autoDetect = () => {
    const auto = autoMapHeaders(headers, fields)
    setMapping(auto)
    if (importKind === 'bills') setAmountCols(detectBillAmountColumns(headers, auto))
    setSuccess('شناسایی خودکار سرستون‌ها انجام شد.')
  }

  const toggleAmountCol = (header, enabled) => {
    setAmountCols((prev) => prev.map((c) => (c.header === header ? { ...c, enabled } : c)))
  }

  const setAmountTitle = (header, title) => {
    setAmountCols((prev) => prev.map((c) => (c.header === header ? { ...c, title } : c)))
  }

  const addExtraAmountCol = () => {
    if (!extraAmountHeader) {
      setError('ابتدا ستون مبلغ اضافی را انتخاب کنید')
      return
    }
    if (amountCols.some((c) => c.header === extraAmountHeader)) {
      setError('این ستون قبلاً به‌عنوان مبلغ اضافه شده است')
      return
    }
    setAmountCols((prev) => [
      ...prev,
      {
        header: extraAmountHeader,
        title: extraAmountTitle || 'سایر',
        enabled: true,
      },
    ])
    setExtraAmountHeader('')
    setSuccess(`ستون «${extraAmountHeader}» به‌عنوان مبلغ «${extraAmountTitle || 'سایر'}» اضافه شد`)
  }

  const goPreview = () => {
    setError('')
    if (!mapping.unit_name) {
      setError('ستون «نام واحد» الزامی است')
      return
    }
    if (importKind === 'bills') {
      const enabled = amountCols.filter((c) => c.enabled)
      const hasLegacy = Boolean(mapping.amount)
      if (!enabled.length && !hasLegacy) {
        setError(
          'حداقل یک ستون مبلغ/عنوان قبض (برق، آب، ذخیره صندوق، …) را فعال کنید یا ستون مبلغ تک‌ستونه را نگاشت کنید',
        )
        return
      }
      if (billValidation.valid === 0) {
        setError(
          'هیچ قبضی با مبلغ معتبر ساخته نشد. سرستون‌های مبلغ و ردیف‌ها را بررسی کنید.\n' +
            (expanded.errors.slice(0, 3).join('\n') || ''),
        )
        return
      }
    } else if (residentValidation.valid === 0) {
      setError('هیچ ردیف معتبری برای ساکنین پیدا نشد')
      return
    }
    setStep('preview')
  }

  const downloadPreviewExcel = () => {
    if (importKind !== 'bills' || !expanded.bills.length) {
      setError('پیش‌نمایش قبضی برای دانلود نیست')
      return
    }
    try {
      // فایل واقعی Excel (.xlsx) — در ویندوز/اکسل و لیبره‌آفیس باز می‌شود
      const rows = expanded.bills.map((b, i) => {
        const recv = normalizeJalaliDateInput(b.receive_date || b.due_date)
        const paid = normalizeJalaliDateInput(b.paid_at)
        const status =
          b.paid_at || b.status === 'پرداخت‌شده' || paid.ok ? 'پرداخت‌شده' : b.status || 'پرداخت‌نشده'
        return {
          ردیف: i + 1,
          'نام واحد': b.unit_name || '',
          طبقه: b.floor || '',
          نام: b.first_name || '',
          'نام خانوادگی': b.last_name || '',
          'عنوان قبض': b.title || '',
          مبلغ: Number(b.amount) || 0,
          'تاریخ دریافت': recv.ok ? recv.jalali : b.receive_date || b.due_date || '',
          'تاریخ پرداخت': paid.ok ? paid.jalali : b.paid_at || '',
          وضعیت: status,
          توضیح: b.description || '',
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 6 },
        { wch: 10 },
        { wch: 8 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 12 },
        { wch: 28 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'پیش‌نمایش قبض‌ها')
      const fname = `preview-bills-block${toEnglishDigits(admin.block_number)}-${(activeSheet || 'sheet').replace(/[\\/:*?"<>|]/g, '_')}.xlsx`
      XLSX.writeFile(wb, fname)
      setSuccess(
        `فایل اکسل «${fname}» دانلود شد. آن را با Excel باز کنید؛ پس از بررسی، تأیید مدیر و ثبت در دیتابیس را بزنید.`,
      )
    } catch (err) {
      // fallback CSV
      try {
        const csv = billsPreviewToCsv(expanded.bills)
        downloadBlob(
          csv,
          `preview-bills-${toEnglishDigits(admin.block_number)}.csv`,
          'text/csv;charset=utf-8;',
        )
        setSuccess('پیش‌نمایش به‌صورت CSV دانلود شد (باز کردن با Excel: Data → From Text/CSV).')
      } catch {
        setError(err.message || 'دانلود پیش‌نمایش ناموفق بود')
      }
    }
  }

  const runImport = async () => {
    setError('')
    setSuccess('')
    setResultInfo(null)
    if (importKind === 'bills' && !managerConfirmed) {
      setError('ابتدا پیش‌نمایش اکسل را بررسی و گزینه «تأیید مدیر» را فعال کنید')
      return
    }
    setBusy(true)
    try {
      if (importKind === 'bills') {
        const payloadRows = expanded.bills.map((r) => {
          const recv = normalizeJalaliDateInput(r.receive_date || r.due_date)
          const paid = normalizeJalaliDateInput(r.paid_at)
          return {
            unit_name: r.unit_name,
            title: r.title || defaultTitle,
            amount: r.amount,
            status: r.status || 'پرداخت‌نشده',
            // همیشه به صورت 1405/05/03 برای پارس سرور
            due_date: recv.ok ? recv.jalali : r.due_date || r.receive_date || '',
            receive_date: recv.ok ? recv.jalali : r.receive_date || r.due_date || '',
            paid_at: paid.ok ? paid.jalali : r.paid_at || '',
            description: r.description || '',
            first_name: r.first_name || '',
            last_name: r.last_name || '',
            phone: r.phone || '',
            floor: r.floor || '',
            occupancy: r.occupancy || '',
            pin: r.pin || '',
            people_count: r.people_count || '',
          }
        })
        if (!payloadRows.length) throw new Error('قبض معتبری برای صدور یافت نشد')

        const res = await fetch('/api/units-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_bills',
            block_number: admin.block_number,
            block_direction: admin.block_direction,
            created_by: admin.full_name || 'مدیر بلوک',
            created_by_role: admin.role || 'block_manager',
            upsert_residents: upsertResidents,
            notify_residents: notifyResidents,
            default_title: defaultTitle,
            rows: payloadRows,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'صدور قبض از اکسل ناموفق بود')
        setResultInfo(data)
        setSuccess(
          `✅ ${data.inserted.toLocaleString('fa-IR')} قبض از ${expanded.sourceRows.toLocaleString('fa-IR')} ردیف اکسل در دیتابیس ثبت شد` +
            (data.residentsTouched
              ? ` | ${data.residentsTouched.toLocaleString('fa-IR')} ساکن به‌روز/ایجاد شد`
              : '') +
            (data.skipped ? ` | ${data.skipped.toLocaleString('fa-IR')} مورد رد شد` : ''),
        )
      } else {
        const rows = residentMapped.filter((r) => r.unit_name)
        const payloadRows = rows.map((r) => ({
          unit_name: r.unit_name,
          first_name: r.first_name || '',
          last_name: r.last_name || '',
          floor: r.floor || '',
          occupancy: r.occupancy || 'مالک',
          phone: r.phone || '',
          pin: r.pin || '1234',
          people_count: r.people_count || '1',
        }))
        const res = await fetch('/api/units-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_residents',
            block_number: admin.block_number,
            block_direction: admin.block_direction,
            rows: payloadRows,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'ورود ساکنین ناموفق بود')
        setResultInfo(data)
        setSuccess(
          `وارد شد: ${data.inserted} جدید، ${data.updated} بروزرسانی` +
            (data.errors?.length ? ` | خطا: ${data.errors.length}` : ''),
        )
      }
      onImported?.()
    } catch (err) {
      setError(err.message || 'خطا در ورود اطلاعات')
    } finally {
      setBusy(false)
    }
  }

  const showImport = mode === 'both' || mode === 'import'
  const showExport = mode === 'both' || mode === 'export' || mode === 'table'
  const showTable = mode === 'both' || mode === 'table' || mode === 'export'

  const metaUsedHeaders = new Set(Object.values(mapping || {}).filter(Boolean))
  const freeHeaders = headers.filter((h) => !metaUsedHeaders.has(h))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
        <h2 className="panel-title text-lg">
          {mode === 'import'
            ? 'ورود اطلاعات از اکسل'
            : mode === 'export'
              ? 'خروجی اکسل'
              : mode === 'table'
                ? 'جدول واحدها'
                : 'ورود / خروجی اکسل'}
        </h2>
      </div>

      {showImport && (
        <p className="text-sm text-slate-600 font-semibold leading-7">
          فایل چندشیته را آپلود کنید → <strong>شیت</strong> را انتخاب کنید → سرستون‌ها (نام واحد، طبقه،
          نام، تاریخ دریافت/پرداخت) و ستون‌های مبلغ هر عنوان قبض شناسایی می‌شوند → از هر ردیف، برای هر
          مبلغ&gt;۰ یک قبض جدا صادر می‌شود؛ اگر تاریخ پرداخت باشد همهٔ آن ردیف <strong>پرداخت‌شده</strong>{' '}
          ثبت می‌شود.
        </p>
      )}

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      )}
      {success && (
        <div className="msg-success flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {showExport && !showImport && (
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={exportExcel}
            className="btn-primary !mt-0 inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            خروجی اکسل واحدها
          </button>
        </div>
      )}

      {showExport && showImport && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={exportExcel}
            className="btn-ghost inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            خروجی اکسل واحدها
          </button>
        </div>
      )}

      {showImport && (
        <div className="panel-card rounded-2xl border-2 border-emerald-200 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChangeKind('bills')}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-black inline-flex items-center justify-center gap-2 ${
                importKind === 'bills'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Receipt className="w-4 h-4" />
              صدور قبض از اکسل
            </button>
            <button
              type="button"
              onClick={() => onChangeKind('residents')}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-black inline-flex items-center justify-center gap-2 ${
                importKind === 'residents'
                  ? 'border-sky-500 bg-sky-50 text-slate-600'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Users className="w-4 h-4" />
              ورود ساکنین
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {steps.map((s, idx) => {
              const active = step === s.id
              const done = steps.findIndex((x) => x.id === step) > idx
              return (
                <div key={s.id} className="flex items-center gap-1 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black border ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : done
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}
                  >
                    {(idx + 1).toLocaleString('fa-IR')}. {s.label}
                  </span>
                  {idx < steps.length - 1 && <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />}
                </div>
              )
            })}
          </div>

          {/* UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={importKind === 'bills' ? downloadBillTemplate : downloadResidentTemplate}
                  className="btn-ghost inline-flex items-center justify-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  دانلود نمونه {importKind === 'bills' ? 'قبض چندستونه' : 'ساکنین'}
                </button>
                <label
                  className={`btn-admin !mt-0 inline-flex items-center justify-center gap-2 cursor-pointer ${
                    busy ? 'opacity-60 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  {busy ? 'در حال خواندن...' : 'آپلود Excel / CSV'}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-3 text-xs font-bold text-slate-600 leading-6">
                {importKind === 'bills' ? (
                  <>
                    <strong>ستون‌های هویت:</strong> نام واحد، طبقه، نام، نام خانوادگی، تاریخ دریافت، تاریخ
                    پرداخت
                    <br />
                    <strong>ستون‌های مبلغ (هر کدام = یک عنوان قبض):</strong> قبض برق، قبض آب، ذخیره صندوق،
                    سایر، …
                    <br />
                    مثال یک ردیف واحد ۲ با آب ۵۰۰ + برق ۳۰۰ + ذخیره ۲۰۰ → <strong>۳ قبض</strong>؛ اگر تاریخ
                    پرداخت پر باشد هر سه <strong>پرداخت‌شده</strong> ثبت می‌شوند.
                  </>
                ) : (
                  <>ستون‌های پیشنهادی: نام واحد، نام، نام خانوادگی، طبقه، وضعیت، تلفن، رمز</>
                )}
              </div>
            </div>
          )}

          {/* SHEET PICKER */}
          {step === 'sheet' && (
            <div className="space-y-3">
              <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3">
                <p className="text-sm font-black text-violet-950 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  کدام شیت استفاده شود؟
                </p>
                <p className="text-xs font-bold text-violet-900 mt-1 leading-6">
                  فایل «{fileName}» شامل {sheetNames.length.toLocaleString('fa-IR')} شیت است. شیت موردنظر
                  برای {importKind === 'bills' ? 'صدور قبض' : 'ورود ساکنین'} را انتخاب کنید.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {sheetNames.map((n, idx) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => chooseSheet(n)}
                    className="rounded-xl border-2 border-emerald-300 bg-white hover:bg-emerald-50 px-4 py-3 text-right transition"
                  >
                    <span className="block text-xs font-bold text-emerald-700">
                      شیت {(idx + 1).toLocaleString('fa-IR')}
                    </span>
                    <span className="block text-sm font-black text-slate-900 mt-0.5">{n}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={resetWizard} className="btn-ghost w-full text-sm">
                انتخاب فایل دیگر
              </button>
            </div>
          )}

          {/* MAP */}
          {step === 'map' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
                <span className="rounded-lg bg-slate-100 px-2 py-1">📄 {fileName}</span>
                <span className="rounded-lg bg-violet-100 text-violet-900 px-2 py-1">
                  شیت: {activeSheet}
                </span>
                <span className="rounded-lg bg-slate-100 px-2 py-1">
                  {rawRows.length.toLocaleString('fa-IR')} ردیف
                </span>
                <span className="rounded-lg bg-slate-100 px-2 py-1">
                  {headers.length.toLocaleString('fa-IR')} ستون
                </span>
                {importKind === 'bills' && (
                  <span className="rounded-lg bg-emerald-100 text-emerald-900 px-2 py-1">
                    ≈ {billValidation.valid.toLocaleString('fa-IR')} قبض قابل صدور
                  </span>
                )}
              </div>

              {sheetNames.length > 1 && (
                <button
                  type="button"
                  className="btn-ghost !py-2 text-sm"
                  onClick={() => {
                    setStep('sheet')
                    setSuccess('شیت دیگری انتخاب کنید')
                  }}
                >
                  <ChevronRight className="w-4 h-4 inline" />
                  تغییر شیت
                </button>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={autoDetect}
                  className="btn-ghost !py-2 inline-flex items-center gap-1.5 text-sm"
                >
                  <Wand2 className="w-4 h-4" />
                  شناسایی خودکار مجدد
                </button>
                <button type="button" onClick={resetWizard} className="btn-ghost !py-2 text-sm">
                  انتخاب فایل دیگر
                </button>
              </div>

              <div className="rounded-xl border border-emerald-200 overflow-hidden">
                <div className="bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-900 flex items-center gap-2">
                  <Columns3 className="w-4 h-4" />
                  سرستون‌های هویت واحد / شخص / تاریخ
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  {fields.map((f) => (
                    <div
                      key={f.key}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 py-2.5 items-center"
                    >
                      <div className="text-sm font-bold text-slate-800">
                        {f.label}
                        {f.required && <span className="text-rose-600 mr-1">*</span>}
                      </div>
                      <select
                        className="field-input !py-2"
                        value={mapping[f.key] || ''}
                        onChange={(e) => setMapField(f.key, e.target.value)}
                      >
                        <option value="">— انتخاب ستون —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {importKind === 'bills' && (
                <div className="rounded-xl border-2 border-amber-200 overflow-hidden">
                  <div className="bg-amber-50 px-3 py-2 text-sm font-black text-amber-950">
                    ستون‌های مبلغ = عنوان قبض (چند قبض از یک ردیف)
                  </div>
                  <div className="bg-white p-3 space-y-2">
                    <p className="text-[11px] font-bold text-slate-600 leading-5">
                      هر ستون فعال با مبلغ &gt; ۰ در همان ردیف، یک قبض جدا با همان عنوان می‌سازد. تاریخ
                      دریافت/پرداخت از ستون‌های بالا برای همهٔ قبض‌های آن ردیف اعمال می‌شود.
                    </p>
                    {amountCols.length === 0 ? (
                      <p className="text-xs font-bold text-rose-700">
                        ستون مبلغ شناخته‌شده‌ای پیدا نشد. از بخش زیر یک ستون را دستی اضافه کنید یا نام
                        سرستون‌ها شبیه «قبض آب / قبض برق / ذخیره صندوق» باشد.
                      </p>
                    ) : (
                      amountCols.map((c) => (
                        <div
                          key={c.header}
                          className={`rounded-xl border px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 ${
                            c.enabled ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <label className="inline-flex items-center gap-2 text-sm font-black text-slate-800 shrink-0">
                            <input
                              type="checkbox"
                              className="accent-emerald-600"
                              checked={c.enabled}
                              onChange={(e) => toggleAmountCol(c.header, e.target.checked)}
                            />
                            <span className="text-xs font-bold text-slate-500">ستون:</span>
                            {c.header}
                          </label>
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-600 shrink-0">عنوان قبض:</span>
                            <select
                              className="field-input !py-1.5 text-sm"
                              value={
                                KNOWN_BILL_TITLES.some((t) => t.title === c.title) ? c.title : '__custom__'
                              }
                              onChange={(e) => {
                                if (e.target.value === '__custom__') return
                                setAmountTitle(c.header, e.target.value)
                              }}
                            >
                              {KNOWN_BILL_TITLES.map((t) => (
                                <option key={t.title} value={t.title}>
                                  {t.title}
                                </option>
                              ))}
                              <option value="__custom__">سفارشی…</option>
                            </select>
                            {!KNOWN_BILL_TITLES.some((t) => t.title === c.title) && (
                              <input
                                className="field-input !py-1.5 text-sm"
                                value={c.title}
                                onChange={(e) => setAmountTitle(c.header, e.target.value)}
                              />
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    <div className="rounded-xl border border-dashed border-slate-300 p-3 space-y-2">
                      <p className="text-xs font-black text-slate-700">افزودن ستون مبلغ دیگر</p>
                      <div className="grid sm:grid-cols-3 gap-2">
                        <select
                          className="field-input !py-2"
                          value={extraAmountHeader}
                          onChange={(e) => setExtraAmountHeader(e.target.value)}
                        >
                          <option value="">— ستون —</option>
                          {freeHeaders.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                        <select
                          className="field-input !py-2"
                          value={extraAmountTitle}
                          onChange={(e) => setExtraAmountTitle(e.target.value)}
                        >
                          {KNOWN_BILL_TITLES.map((t) => (
                            <option key={t.title} value={t.title}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="btn-ghost !py-2" onClick={addExtraAmountCol}>
                          افزودن
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {importKind === 'bills' && (
                <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                  <label className="block text-sm font-bold text-slate-800">
                    عنوان پیش‌فرض (فقط اگر حالت تک‌ستونه مبلغ/عنوان باشد)
                    <input
                      className="field-input mt-1"
                      value={defaultTitle}
                      onChange={(e) => setDefaultTitle(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={upsertResidents}
                      onChange={(e) => setUpsertResidents(e.target.checked)}
                    />
                    اگر ساکن نبود از روی اکسل ساخته/به‌روز شود
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      checked={notifyResidents}
                      onChange={(e) => setNotifyResidents(e.target.checked)}
                    />
                    اطلاع‌رسانی به ساکن برای قبض‌های پرداخت‌نشده
                  </label>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={goPreview}
                  className="btn-primary !mt-0 inline-flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  پیش‌نمایش (
                  {importKind === 'bills'
                    ? `${billValidation.valid.toLocaleString('fa-IR')} قبض از ${expanded.sourceRows.toLocaleString('fa-IR')} ردیف`
                    : `${residentValidation.valid.toLocaleString('fa-IR')} ردیف`}
                  )
                </button>
              </div>
              {importKind === 'bills' && expanded.errors.length > 0 && (
                <p className="text-xs font-bold text-amber-800">
                  {expanded.errors.length.toLocaleString('fa-IR')} ردیف بدون مبلغ معتبر (رد می‌شوند)
                </p>
              )}
            </div>
          )}

          {/* PREVIEW */}
          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-800">
                  {importKind === 'bills' ? (
                    <>
                      پیش‌نمایش اکسل قبض‌ها (قبل از دیتابیس) —{' '}
                      {billValidation.valid.toLocaleString('fa-IR')} قبض از{' '}
                      {expanded.sourceRows.toLocaleString('fa-IR')} ردیف شیت «{activeSheet}»
                    </>
                  ) : (
                    <>پیش‌نمایش ساکنین — {residentValidation.valid.toLocaleString('fa-IR')} ردیف</>
                  )}
                </p>
                <button
                  type="button"
                  className="btn-ghost !py-2 text-sm"
                  onClick={() => {
                    setManagerConfirmed(false)
                    setStep('map')
                  }}
                >
                  <ChevronRight className="w-4 h-4 inline" />
                  بازگشت
                </button>
              </div>

              {importKind === 'bills' && (
                <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 space-y-2">
                  <p className="text-sm font-black text-violet-950">مرحله تأیید مدیر</p>
                  <p className="text-xs font-bold text-violet-900 leading-6">
                    قبض‌ها هنوز در دیتابیس ذخیره نشده‌اند. جدول زیر همان خروجی اکسل نهایی است. تاریخ‌های
                    عددی مثل <span className="dir-ltr font-black">14050503</span> به{' '}
                    <span className="font-black">۱۴۰۵/۰۵/۰۳</span> تبدیل شده‌اند. پس از بررسی، فایل را
                    دانلود کنید و با تأیید، در دیتابیس ثبت کنید.
                  </p>
                  <button
                    type="button"
                    onClick={downloadPreviewExcel}
                    className="btn-ghost !py-2 inline-flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    دانلود پیش‌نمایش اکسل (CSV)
                  </button>
                </div>
              )}

              <div className="sheet-frame sheet-frame-scroll border-2 border-emerald-300">
                <div className="sheet-titlebar !bg-emerald-700 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-white">
                    <FileSpreadsheet className="w-4 h-4" />
                    {importKind === 'bills' ? 'جدول اکسل قبوض صادرشده (پیش‌نویس)' : 'جدول ساکنین'}
                  </span>
                  <span className="text-[11px] text-emerald-100">
                    {importKind === 'bills'
                      ? `${billValidation.valid.toLocaleString('fa-IR')} ردیف · اسکرول کنید`
                      : `${residentValidation.valid.toLocaleString('fa-IR')} ردیف`}
                  </span>
                </div>
                <div className="sheet-scroll">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th className="col-index sticky top-0 z-10">#</th>
                        <th className="sticky top-0 z-10">واحد</th>
                        {importKind === 'bills' ? (
                          <>
                            <th className="sticky top-0 z-10">طبقه</th>
                            <th className="sticky top-0 z-10">عنوان قبض</th>
                            <th className="sticky top-0 z-10">مبلغ</th>
                            <th className="sticky top-0 z-10">تاریخ دریافت</th>
                            <th className="sticky top-0 z-10">تاریخ پرداخت</th>
                            <th className="sticky top-0 z-10">وضعیت</th>
                            <th className="sticky top-0 z-10">نام ساکن</th>
                          </>
                        ) : (
                          <>
                            <th className="sticky top-0 z-10">نام</th>
                            <th className="sticky top-0 z-10">نام خانوادگی</th>
                            <th className="sticky top-0 z-10">طبقه</th>
                            <th className="sticky top-0 z-10">تلفن</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {importKind === 'bills'
                        ? expanded.bills.map((r, idx) => {
                            const recv =
                              r.receive_date_fa ||
                              normalizeJalaliDateInput(r.receive_date || r.due_date).jalaliFa ||
                              r.receive_date ||
                              r.due_date ||
                              '—'
                            const paid =
                              r.paid_at_fa ||
                              normalizeJalaliDateInput(r.paid_at).jalaliFa ||
                              r.paid_at ||
                              '—'
                            const isPaid = Boolean(r.paid_at) || r.status === 'پرداخت‌شده'
                            return (
                              <tr key={`${r.unit_name}-${r.title}-${idx}`}>
                                <td className="col-index">{(idx + 1).toLocaleString('fa-IR')}</td>
                                <td className="cell-unit">{r.unit_name}</td>
                                <td className="cell-unit">{r.floor || '—'}</td>
                                <td className="cell-name">{r.title}</td>
                                <td className="cell-num">
                                  {Number(r.amount || 0).toLocaleString('fa-IR')}
                                </td>
                                <td className="cell-name text-[11px] font-black text-slate-600">{recv}</td>
                                <td className="cell-name text-[11px] font-black text-violet-900">
                                  {paid}
                                </td>
                                <td className="cell-name">
                                  <span
                                    className={
                                      isPaid ? 'text-emerald-700 font-black' : 'text-rose-700 font-bold'
                                    }
                                  >
                                    {isPaid ? 'پرداخت‌شده' : r.status || 'پرداخت‌نشده'}
                                  </span>
                                </td>
                                <td className="cell-name">
                                  {[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}
                                </td>
                              </tr>
                            )
                          })
                        : residentMapped
                            .filter((r) => r.unit_name)
                            .map((r, idx) => (
                              <tr key={`${r.unit_name}-${idx}`}>
                                <td className="col-index">{(idx + 1).toLocaleString('fa-IR')}</td>
                                <td className="cell-unit">{r.unit_name}</td>
                                <td className="cell-name">{r.first_name || '—'}</td>
                                <td className="cell-name">{r.last_name || '—'}</td>
                                <td className="cell-unit">{r.floor || '—'}</td>
                                <td className="cell-num">{r.phone || '—'}</td>
                              </tr>
                            ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {importKind === 'bills' && (
                <p className="text-xs font-bold text-slate-600">
                  برای دیدن همه ستون‌ها جدول را افقی/عمودی اسکرول کنید یا «دانلود پیش‌نمایش اکسل» را بزنید.
                </p>
              )}

              {importKind === 'bills' && (
                <label className="flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 accent-emerald-600 w-4 h-4"
                    checked={managerConfirmed}
                    onChange={(e) => setManagerConfirmed(e.target.checked)}
                  />
                  <span className="text-sm font-black text-amber-950 leading-6">
                    تأیید مدیر: پیش‌نمایش اکسل را بررسی کردم و با ثبت{' '}
                    {billValidation.valid.toLocaleString('fa-IR')} قبض در دیتابیس موافقم.
                  </span>
                </label>
              )}

              <button
                type="button"
                disabled={
                  busy ||
                  validation.valid === 0 ||
                  (importKind === 'bills' && !managerConfirmed)
                }
                onClick={runImport}
                className="btn-admin !mt-0 w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? (
                  'در حال ثبت در دیتابیس...'
                ) : importKind === 'bills' ? (
                  <>
                    <Receipt className="w-4 h-4" />
                    تأیید نهایی و ذخیره {billValidation.valid.toLocaleString('fa-IR')} قبض در دیتابیس
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    ثبت {residentValidation.valid.toLocaleString('fa-IR')} ساکن در دیتابیس
                  </>
                )}
              </button>

              {resultInfo?.errors?.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 max-h-40 overflow-auto">
                  <p className="text-xs font-black text-amber-900 mb-1">جزئیات موارد رد شده:</p>
                  <ul className="text-[11px] font-bold text-amber-900 space-y-0.5">
                    {resultInfo.errors.slice(0, 40).map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {resultInfo?.created?.length > 0 && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">
                  نمونه قبض‌های ثبت‌شده:{' '}
                  {resultInfo.created
                    .slice(0, 6)
                    .map((c) => `#${c.id} ${c.unit_name}/${c.title}`)
                    .join(' | ')}
                  {resultInfo.created.length > 6 ? ' ...' : ''}
                </div>
              )}

              {resultInfo && (
                <button type="button" className="btn-ghost w-full" onClick={resetWizard}>
                  شروع ورود جدید
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showTable && (
        <div className="sheet-frame">
          <div className="sheet-titlebar">
            <span className="inline-flex items-center gap-1.5">
              <Table2 className="w-4 h-4" />
              جدول واحدها
            </span>
            <span className="text-[11px]">{blockResidents.length.toLocaleString('fa-IR')} واحد</span>
          </div>
          <div className="overflow-x-auto bg-white">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="col-index">ردیف</th>
                  <th>نام واحد</th>
                  <th>نام ساکن</th>
                  <th>طبقه</th>
                  <th>وضعیت</th>
                  <th>تلفن</th>
                </tr>
              </thead>
              <tbody>
                {blockResidents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-500 font-semibold">
                      واحدی ثبت نشده
                    </td>
                  </tr>
                ) : (
                  blockResidents.map((r, idx) => (
                    <tr key={r.id || r.unit_name}>
                      <td className="col-index">{(idx + 1).toLocaleString('fa-IR')}</td>
                      <td className="cell-unit">{r.unit_name}</td>
                      <td className="cell-name">
                        {r.first_name} {r.last_name}
                        {r.is_occupant ? ' ★' : ''}
                      </td>
                      <td className="cell-unit">{r.floor}</td>
                      <td className="cell-name">{r.occupancy}</td>
                      <td className="cell-num">{r.phone}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
