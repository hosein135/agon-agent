/**
 * قانون برنامه: اعداد فارسی/عربی با اعداد انگلیسی یکسان‌اند.
 * ۰۱۲۳۴۵۶۷۸۹  ≡  0123456789
 * ٠١٢٣٤٥٦٧٨٩  ≡  0123456789
 */

const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC = '٠١٢٣٤٥٦٧٨٩'
const ENGLISH = '0123456789'

export function toEnglishDigits(value: unknown) {
  if (value == null) return ''
  let s = String(value)
  for (let i = 0; i < 10; i++) {
    s = s.split(PERSIAN[i]).join(ENGLISH[i])
    s = s.split(ARABIC[i]).join(ENGLISH[i])
  }
  return s
}

export function toPersianDigits(value: unknown) {
  if (value == null) return ''
  let s = toEnglishDigits(value)
  for (let i = 0; i < 10; i++) {
    s = s.split(ENGLISH[i]).join(PERSIAN[i])
  }
  return s
}

/** Keep digits only, after normalizing Persian/Arabic → English */
export function onlyDigits(value: unknown) {
  return toEnglishDigits(value).replace(/\D/g, '')
}

/** Normalize mixed numeric text (keeps non-digits, converts digit shapes) */
export function normalizeNumericInput(value: unknown) {
  return toEnglishDigits(value)
}
