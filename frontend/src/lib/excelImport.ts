import * as XLSX from 'xlsx'
import { toEnglishDigits, onlyDigits, toPersianDigits } from './digits'

/**
 * نرمال‌سازی تاریخ شمسی برای نمایش و ذخیرهٔ متنی.
 * مثال: ۱۴۰۵۰۵۰۳ | 14050503 | 1405-5-3 → 1405/05/03
 * خروجی: { jalali: '1405/05/03', jalaliFa: '۱۴۰۵/۰۵/۰۳', ok: true } | { ok:false }
 */
export function normalizeJalaliDateInput(v: unknown) {
  if (v == null || v === '') return { ok: false, jalali: '', jalaliFa: '' }

  // عدد خالص اکسل
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.round(v)
    // تاریخ فشرده شمسی ۸ رقمی
    if (n >= 12000101 && n <= 15991231) {
      const s = String(n)
      return packJalali(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8))
    }
    // سریال اکسل → بعداً در API میلادی می‌شود؛ اینجا خالی
    return { ok: false, jalali: '', jalaliFa: '', excelSerial: n }
  }

  let s = toEnglishDigits(String(v)).trim()
  if (!s) return { ok: false, jalali: '', jalaliFa: '' }

  // فقط رقم: 14050503 یا 1405503 (۷ رقمی نادر)
  const digitsOnly = s.replace(/\D/g, '')
  if (/^\d{8}$/.test(digitsOnly)) {
    const y = digitsOnly.slice(0, 4)
    const m = digitsOnly.slice(4, 6)
    const d = digitsOnly.slice(6, 8)
    const yi = Number(y)
    if (yi >= 1200 && yi <= 1599) return packJalali(y, m, d)
    // میلادی فشرده 20260503 — به شمسی تبدیل نمی‌کنیم؛ برچسب میلادی
    if (yi >= 1900 && yi <= 2100) {
      const g = `${y}/${m}/${d}`
      return { ok: true, jalali: g, jalaliFa: toPersianDigits(g), gregorian: true }
    }
  }

  // 1405/05/03 یا 1405-5-3
  const m1 = s.match(/^(\d{4})[\/\-.\s](\d{1,2})[\/\-.\s](\d{1,2})/)
  if (m1) {
    const yi = Number(m1[1])
    if (yi >= 1200 && yi <= 1599) return packJalali(m1[1], m1[2], m1[3])
    if (yi >= 1900 && yi <= 2100) {
      const g = `${m1[1]}/${pad2(m1[2])}/${pad2(m1[3])}`
      return { ok: true, jalali: g, jalaliFa: toPersianDigits(g), gregorian: true }
    }
  }

  // 03/05/1405
  const m2 = s.match(/^(\d{1,2})[\/\-.\s](\d{1,2})[\/\-.\s](\d{4})$/)
  if (m2) {
    const yi = Number(m2[3])
    if (yi >= 1200 && yi <= 1599) return packJalali(m2[3], m2[2], m2[1])
  }

  return { ok: false, jalali: '', jalaliFa: '' }
}

function pad2(x: unknown) {
  return String(x).padStart(2, '0')
}

function packJalali(y: unknown, m: unknown, d: unknown) {
  const yi = Number(y)
  const mi = Number(m)
  const di = Number(d)
  if (!Number.isFinite(yi) || !Number.isFinite(mi) || !Number.isFinite(di)) {
    return { ok: false, jalali: '', jalaliFa: '' }
  }
  if (mi < 1 || mi > 12 || di < 1 || di > 31) {
    return { ok: false, jalali: '', jalaliFa: '' }
  }
  const jalali = `${yi}/${pad2(mi)}/${pad2(di)}`
  return { ok: true, jalali, jalaliFa: toPersianDigits(jalali), gregorian: false }
}

/** ساخت CSV/Excel پیش‌نمایش قبض‌ها برای تأیید مدیر */
export function billsPreviewToCsv(bills: Array<Record<string, unknown>> | null | undefined) {
  const cols = [
    'ردیف',
    'نام واحد',
    'طبقه',
    'نام',
    'نام خانوادگی',
    'عنوان قبض',
    'مبلغ',
    'تاریخ دریافت',
    'تاریخ پرداخت',
    'وضعیت',
    'توضیح',
  ]
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [cols.map(esc).join(',')]
  ;(bills || []).forEach((b, i) => {
    const recv = normalizeJalaliDateInput(b.receive_date || b.due_date)
    const paid = normalizeJalaliDateInput(b.paid_at)
    const status =
      b.paid_at || b.status === 'پرداخت‌شده' || paid.ok ? 'پرداخت‌شده' : b.status || 'پرداخت‌نشده'
    lines.push(
      [
        i + 1,
        b.unit_name,
        b.floor || '',
        b.first_name || '',
        b.last_name || '',
        b.title || '',
        b.amount || '',
        recv.ok ? recv.jalaliFa || recv.jalali : b.receive_date || b.due_date || '',
        paid.ok ? paid.jalaliFa || paid.jalali : b.paid_at || '',
        status,
        b.description || '',
      ]
        .map(esc)
        .join(','),
    )
  })
  return `\uFEFF${lines.join('\n')}`
}

/** ستون‌های شناسه واحد / شخص / تاریخ — نه مبلغ */
export const BILL_META_FIELDS = [
  {
    key: 'unit_name',
    label: 'نام واحد',
    required: true,
    aliases: [
      'unit',
      'unit_name',
      'unitname',
      'unit no',
      'unit_no',
      'شماره واحد',
      'نام واحد',
      'واحد',
      'unit number',
      'plak',
      'پلاک',
      'شماره',
    ],
  },
  {
    key: 'floor',
    label: 'طبقه',
    required: false,
    aliases: ['floor', 'طبقه', 'story', 'level', 'طبقه واحد'],
  },
  {
    key: 'first_name',
    label: 'نام ساکن',
    required: false,
    aliases: ['first_name', 'firstname', 'name', 'نام', 'نام ساکن', 'نام مالک', 'نام و نام خانوادگی'],
  },
  {
    key: 'last_name',
    label: 'نام خانوادگی',
    required: false,
    aliases: ['last_name', 'lastname', 'family', 'surname', 'نام خانوادگی', 'نام‌خانوادگی', 'فامیلی'],
  },
  {
    key: 'phone',
    label: 'تلفن',
    required: false,
    aliases: ['phone', 'mobile', 'tel', 'تلفن', 'موبایل', 'شماره تماس'],
  },
  {
    key: 'occupancy',
    label: 'مالک/مستاجر',
    required: false,
    aliases: ['occupancy', 'owner', 'tenant', 'مالک', 'مستاجر', 'وضعیت سکونت', 'نوع سکونت'],
  },
  {
    key: 'people_count',
    label: 'تعداد نفرات',
    required: false,
    aliases: ['people', 'people_count', 'persons', 'members', 'family', 'تعداد نفرات', 'نفرات', 'خانوار'],
  },
  {
    key: 'receive_date',
    label: 'تاریخ دریافت قبض',
    required: false,
    aliases: [
      'receive_date',
      'received_at',
      'due_date',
      'due',
      'date',
      'تاریخ دریافت',
      'تاریخ دریافت قبض',
      'تاریخ قبض',
      'تاریخ صدور',
      'تاریخ',
      'تاريخ',
      'ماه',
      'period',
    ],
  },
  {
    key: 'paid_at',
    label: 'تاریخ پرداخت',
    required: false,
    aliases: [
      'paid_at',
      'payment_date',
      'pay date',
      'pay_date',
      'تاریخ پرداخت',
      'تاريخ پرداخت',
      'تاریخ تسویه',
      'پرداخت',
    ],
  },
  {
    key: 'status',
    label: 'وضعیت پرداخت (اختیاری)',
    required: false,
    aliases: ['status', 'state', 'paid', 'وضعیت', 'وضعیت پرداخت', 'تسویه', 'payment status'],
  },
  {
    key: 'description',
    label: 'توضیح',
    required: false,
    aliases: ['description', 'desc', 'note', 'notes', 'توضیح', 'توضیحات', 'شرح', 'ملاحظات'],
  },
  {
    key: 'pin',
    label: 'رمز ورود',
    required: false,
    aliases: ['pin', 'password', 'pass', 'رمز', 'رمز عبور'],
  },
]

/** سازگاری با کد قبلی */
export const BILL_FIELDS = [
  ...BILL_META_FIELDS,
  {
    key: 'title',
    label: 'عنوان قبض (تک‌ستونه)',
    required: false,
    aliases: ['title', 'bill', 'bill_title', 'type', 'عنوان', 'عنوان قبض', 'نوع قبض', 'بابت'],
  },
  {
    key: 'amount',
    label: 'مبلغ (تک‌ستونه)',
    required: false,
    aliases: ['amount', 'price', 'sum', 'total', 'مبلغ', 'مبلغ قبض', 'بدهی', 'مانده'],
  },
]

export const RESIDENT_FIELDS = [
  { key: 'unit_name', label: 'نام واحد', required: true, aliases: BILL_META_FIELDS.find((f) => f.key === 'unit_name').aliases },
  { key: 'first_name', label: 'نام', required: false, aliases: BILL_META_FIELDS.find((f) => f.key === 'first_name').aliases },
  { key: 'last_name', label: 'نام خانوادگی', required: false, aliases: BILL_META_FIELDS.find((f) => f.key === 'last_name').aliases },
  { key: 'floor', label: 'طبقه', required: false, aliases: BILL_META_FIELDS.find((f) => f.key === 'floor').aliases },
  { key: 'occupancy', label: 'وضعیت', required: false, aliases: BILL_META_FIELDS.find((f) => f.key === 'occupancy').aliases },
  { key: 'phone', label: 'تلفن', required: false, aliases: BILL_META_FIELDS.find((f) => f.key === 'phone').aliases },
  { key: 'pin', label: 'رمز', required: false, aliases: BILL_META_FIELDS.find((f) => f.key === 'pin').aliases },
  { key: 'people_count', label: 'تعداد نفرات', required: false, aliases: BILL_META_FIELDS.find((f) => f.key === 'people_count').aliases },
]

/** عنوان‌های شناخته‌شده قبض که معمولاً هر کدام یک ستون مبلغ جدا هستند */
export const KNOWN_BILL_TITLES = [
  {
    title: 'قبض برق',
    aliases: ['قبض برق', 'برق', 'بهای برق', 'electric', 'electricity', 'power', 'elc'],
  },
  {
    title: 'قبض آب',
    aliases: ['قبض آب', 'آب', 'اب', 'بهای آب', 'water'],
  },
  {
    title: 'ذخیره صندوق',
    aliases: [
      'ذخیره صندوق',
      'ذخیره در صندوق',
      'ذخیره',
      'صندوق',
      'صندوف',
      'پس‌انداز',
      'پس انداز',
      'fund',
      'reserve',
      'sandoogh',
    ],
  },
  {
    title: 'شارژ',
    aliases: ['شارژ', 'شارژ ماهانه', 'شارژ ساختمان', 'charge', 'maintenance'],
  },
  {
    title: 'قبض گاز',
    aliases: ['قبض گاز', 'گاز', 'gas'],
  },
  {
    title: 'سایر',
    aliases: ['سایر', 'سایر پرداختها', 'سایر پرداخت‌ها', 'سایر هزینه‌ها', 'other', 'misc', 'متفرقه'],
  },
]

function normHeader(h: unknown) {
  return toEnglishDigits(String(h || ''))
    .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function headerMatchesAlias(header: unknown, alias: unknown) {
  const nh = normHeader(header)
  const na = normHeader(alias)
  if (!nh || !na) return false
  return nh === na || nh.includes(na) || na.includes(nh)
}

export function autoMapHeaders(
  headers: string[],
  fields: Array<{ key: string; aliases: string[] }>,
) {
  const map: Record<string, string> = {}
  const used = new Set()
  for (const field of fields) {
    let found = null
    for (const h of headers) {
      if (used.has(h)) continue
      for (const alias of field.aliases) {
        if (headerMatchesAlias(h, alias)) {
          found = h
          break
        }
      }
      if (found) break
    }
    if (found) {
      map[field.key] = found
      used.add(found)
    } else {
      map[field.key] = ''
    }
  }
  return map
}

/**
 * تشخیص ستون‌های مبلغ/عنوان قبض در سرستون‌ها
 * خروجی: [{ header, title, enabled }]
 */
export function detectBillAmountColumns(
  headers: string[],
  metaMapping: Record<string, string> = {},
) {
  const usedMeta = new Set(Object.values(metaMapping || {}).filter(Boolean))
  const result: Array<{ header: string; title: string; enabled: boolean }> = []
  const claimed = new Set()

  for (const h of headers) {
    if (usedMeta.has(h) || claimed.has(h)) continue
    let matched = null
    for (const def of KNOWN_BILL_TITLES) {
      if (def.aliases.some((a) => headerMatchesAlias(h, a))) {
        matched = def.title
        break
      }
    }
    if (matched) {
      result.push({ header: h, title: matched, enabled: true })
      claimed.add(h)
    }
  }

  // ستون‌هایی که فقط «مبلغ + چیزی» هستند
  for (const h of headers) {
    if (usedMeta.has(h) || claimed.has(h)) continue
    const nh = normHeader(h)
    if (
      (nh.includes('مبلغ') || nh.includes('amount') || nh.includes('بدهی') || nh.includes('مانده')) &&
      nh.length > 2
    ) {
      let title = String(h)
        .replace(/مبلغ|amount|بدهی|مانده|تومان|ریال/gi, '')
        .replace(/[()（）]/g, ' ')
        .trim()
      if (!title) title = 'سایر'
      // map known
      for (const def of KNOWN_BILL_TITLES) {
        if (def.aliases.some((a) => headerMatchesAlias(title, a) || headerMatchesAlias(h, a))) {
          title = def.title
          break
        }
      }
      result.push({ header: h, title, enabled: true })
      claimed.add(h)
    }
  }

  return result
}

export function parseAmountCell(v: unknown) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const s = toEnglishDigits(String(v))
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '')
    .trim()
  if (!s) return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** یکسان‌سازی نام واحد برای نمایش و جلوگیری از تکراری ۱۷/17 */
export function normalizeUnitName(unit: unknown) {
  let s = toEnglishDigits(String(unit ?? '')).trim()
  if (!s) return ''
  s = s
    .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, ' ')
    .replace(/واحد/gi, ' ')
    .replace(/#|شماره|پلاک/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '')
  const digits = onlyDigits(s)
  if (digits && /^[\d\s.,]+$/.test(s)) {
    const n = Number(digits)
    if (Number.isFinite(n)) return String(n)
    return digits.replace(/^0+(?=\d)/, '') || digits
  }
  return s
}

/**
 * خواندن CSV یا Excel → { sheetNames, parseSheet }
 */
export async function readSpreadsheetFile(file: File | Blob | null | undefined) {
  if (!file) throw new Error('فایلی انتخاب نشده است')
  const buf = await file.arrayBuffer()
  const name = file instanceof File ? file.name : ''
  const isCsv = /\.csv$/i.test(name) || file.type === 'text/csv'

  let workbook
  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, '')
    workbook = XLSX.read(text, { type: 'string', raw: false, FS: undefined })
  } else {
    workbook = XLSX.read(buf, { type: 'array', cellDates: true, raw: false })
  }

  const sheetNames = workbook.SheetNames || []
  if (!sheetNames.length) throw new Error('هیچ برگه‌ای در فایل پیدا نشد')

  return {
    workbook,
    sheetNames,
    parseSheet(sheetName) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) throw new Error('برگه نامعتبر است')
      const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
        raw: false,
      })
      if (!aoa.length) return { headers: [], rows: [], headerIdx: 0 }

      let headerIdx = 0
      for (let i = 0; i < Math.min(aoa.length, 20); i++) {
        const row = aoa[i] || []
        const nonempty = row.filter((c) => String(c || '').trim()).length
        if (nonempty >= 2) {
          headerIdx = i
          break
        }
      }

      const rawHeaders = (aoa[headerIdx] || []).map((h, i) => {
        const s = String(h || '').trim()
        return s || `ستون_${i + 1}`
      })
      const seen: Record<string, number> = {}
      const headers = rawHeaders.map((h) => {
        if (!seen[h]) {
          seen[h] = 1
          return h
        }
        seen[h] += 1
        return `${h}_${seen[h]}`
      })

      const rows: Array<Record<string, unknown>> = []
      for (let r = headerIdx + 1; r < aoa.length; r++) {
        const line = aoa[r] || []
        if (!line.some((c) => String(c || '').trim())) continue
        const obj: Record<string, unknown> = {}
        headers.forEach((h, i) => {
          obj[h] = line[i] != null ? line[i] : ''
        })
        rows.push(obj)
      }
      return { headers, rows, headerIdx }
    },
  }
}

export function applyColumnMap(
  rows: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
): any[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const [field, header] of Object.entries(mapping || {})) {
      if (!header) continue
      out[field] = row[header] != null ? row[header] : ''
    }
    if (out.unit_name != null) out.unit_name = String(out.unit_name).trim()
    if (out.amount != null) out.amount = toEnglishDigits(String(out.amount)).replace(/[^\d.]/g, '')
    if (out.phone != null) out.phone = onlyDigits(out.phone)
    if (out.pin != null) out.pin = toEnglishDigits(out.pin).trim()
    if (out.floor != null) out.floor = toEnglishDigits(out.floor).trim()
    if (out.people_count != null) out.people_count = onlyDigits(out.people_count)
    if (out.title != null) out.title = String(out.title).trim()
    if (out.status != null) out.status = String(out.status).trim()
    if (out.description != null) out.description = String(out.description).trim()
    if (out.first_name != null) out.first_name = String(out.first_name).trim()
    if (out.last_name != null) out.last_name = String(out.last_name).trim()
    if (out.receive_date != null) out.receive_date = String(out.receive_date).trim()
    if (out.paid_at != null) out.paid_at = String(out.paid_at).trim()
    return out
  })
}

function cellStr(row: Record<string, unknown>, header?: string) {
  if (!header) return ''
  const v = row[header]
  if (v == null) return ''
  return String(v).trim()
}

/**
 * هر ردیف اکسل ممکن است چند ستون مبلغ (چند عنوان قبض) داشته باشد.
 * خروجی: لیست قبض‌های تخت برای API
 */
export function expandBillRowsFromSheet({
  rawRows,
  metaMapping,
  amountColumns = [],
  legacyTitleHeader = '',
  legacyAmountHeader = '',
  defaultTitle = 'بدهی (ورود از اکسل)',
}: {
  rawRows?: Array<Record<string, unknown>>
  metaMapping: Record<string, string>
  amountColumns?: Array<{ header: string; title: string; enabled?: boolean }>
  legacyTitleHeader?: string
  legacyAmountHeader?: string
  defaultTitle?: string
}) {
  const bills: any[] = []
  const errors: string[] = []
  let sourceRows = 0

  const enabledAmounts = (amountColumns || []).filter((c) => c && c.enabled && c.header && c.title)

  for (let i = 0; i < (rawRows || []).length; i++) {
    const row = rawRows[i] || {}
    const unitRaw = cellStr(row, metaMapping.unit_name)
    if (!unitRaw) continue
    const unit_name = normalizeUnitName(unitRaw) || unitRaw
    sourceRows += 1

    const rawReceive = metaMapping.receive_date
      ? row[metaMapping.receive_date]
      : ''
    const rawPaid = metaMapping.paid_at ? row[metaMapping.paid_at] : ''
    const recvNorm = normalizeJalaliDateInput(rawReceive)
    const paidNorm = normalizeJalaliDateInput(rawPaid)

    const receive_date = recvNorm.ok
      ? recvNorm.jalali
      : cellStr(row, metaMapping.receive_date)
    const paid_at = paidNorm.ok ? paidNorm.jalali : cellStr(row, metaMapping.paid_at)

    const base = {
      unit_name,
      floor: cellStr(row, metaMapping.floor),
      first_name: cellStr(row, metaMapping.first_name),
      last_name: cellStr(row, metaMapping.last_name),
      phone: onlyDigits(cellStr(row, metaMapping.phone)),
      occupancy: cellStr(row, metaMapping.occupancy),
      people_count: onlyDigits(cellStr(row, metaMapping.people_count)),
      pin: toEnglishDigits(cellStr(row, metaMapping.pin)).trim(),
      receive_date,
      receive_date_fa: recvNorm.ok ? recvNorm.jalaliFa : receive_date,
      paid_at,
      paid_at_fa: paidNorm.ok ? paidNorm.jalaliFa : paid_at,
      status: cellStr(row, metaMapping.status),
      description: cellStr(row, metaMapping.description),
      source_row: i + 1,
    }

    const hasPaidDate = Boolean(base.paid_at && String(base.paid_at).trim())
    const statusHint = base.status
    const paidStatus =
      hasPaidDate ||
      /پرداخت\s*‌?شده|paid|تسویه|تسويه/i.test(statusHint)
        ? 'پرداخت‌شده'
        : statusHint || 'پرداخت‌نشده'

    let produced = 0

    // حالت عریض: چند ستون مبلغ
    for (const col of enabledAmounts) {
      const amount = parseAmountCell(row[col.header])
      if (!Number.isFinite(amount) || amount <= 0) continue
      const paidFinal = hasPaidDate
        ? base.paid_at
        : paidStatus === 'پرداخت‌شده'
          ? base.receive_date || base.paid_at
          : ''
      const paidFinalFa = hasPaidDate
        ? base.paid_at_fa || base.paid_at
        : paidFinal
          ? base.receive_date_fa || paidFinal
          : ''

      bills.push({
        ...base,
        title: col.title,
        amount: String(amount),
        due_date: base.receive_date || '',
        paid_at: paidFinal,
        paid_at_fa: paidFinalFa,
        status: paidStatus,
        description: [base.description, `ستون:${col.header}`, `ردیف‌اکسل:${i + 1}`]
          .filter(Boolean)
          .join(' | '),
      })
      produced += 1
    }

    // حالت تک‌ستونه (سازگاری)
    if (!produced && legacyAmountHeader) {
      const amount = parseAmountCell(row[legacyAmountHeader])
      if (Number.isFinite(amount) && amount > 0) {
        const title =
          cellStr(row, legacyTitleHeader) ||
          String(defaultTitle || '').trim() ||
          'بدهی (ورود از اکسل)'
        const paidFinal = hasPaidDate
          ? base.paid_at
          : paidStatus === 'پرداخت‌شده'
            ? base.receive_date || ''
            : ''
        bills.push({
          ...base,
          title,
          amount: String(amount),
          due_date: base.receive_date || '',
          paid_at: paidFinal,
          paid_at_fa: paidFinal
            ? hasPaidDate
              ? base.paid_at_fa || paidFinal
              : base.receive_date_fa || paidFinal
            : '',
          status: paidStatus,
          description: [base.description, `ردیف‌اکسل:${i + 1}`].filter(Boolean).join(' | '),
        })
        produced += 1
      }
    }

    if (!produced) {
      // ردیف واحد دارد ولی هیچ مبلغی نیست — رد با هشدار نرم
      errors.push(`ردیف ${i + 1} (واحد ${unit_name}): مبلغ معتبری در ستون‌های قبض یافت نشد`)
    }
  }

  return { bills, errors, sourceRows }
}

export function validateMappedRows(
  mapped: Array<Record<string, unknown>>,
  mode = 'bills',
) {
  const errors: string[] = []
  let valid = 0
  mapped.forEach((r, i) => {
    if (!r.unit_name) {
      errors.push(`ردیف ${i + 1}: نام واحد خالی`)
      return
    }
    if (mode === 'bills') {
      const amt = Number(r.amount)
      if (!Number.isFinite(amt) || amt <= 0) {
        errors.push(`ردیف ${i + 1}: مبلغ نامعتبر`)
        return
      }
    }
    valid += 1
  })
  return { valid, errors }
}

export function validateExpandedBills(bills: Array<Record<string, unknown>> | null | undefined) {
  const errors: string[] = []
  let valid = 0
  ;(bills || []).forEach((b, i) => {
    if (!b.unit_name) {
      errors.push(`قبض ${i + 1}: نام واحد خالی`)
      return
    }
    const amt = Number(b.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      errors.push(`قبض ${i + 1} (واحد ${b.unit_name}): مبلغ نامعتبر`)
      return
    }
    if (!b.title) {
      errors.push(`قبض ${i + 1} (واحد ${b.unit_name}): عنوان خالی`)
      return
    }
    valid += 1
  })
  return { valid, errors, total: (bills || []).length }
}
