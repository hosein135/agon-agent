import { onlyDigits } from './digits'

const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه']
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده']
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود']
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد']
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون']

function threeDigitsToWords(n: number) {
  n = n % 1000
  if (n === 0) return ''
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(HUNDREDS[h])
  if (r) {
    if (r < 10) parts.push(ONES[r])
    else if (r < 20) parts.push(TEENS[r - 10])
    else {
      const t = Math.floor(r / 10)
      const o = r % 10
      if (o) parts.push(`${TENS[t]} و ${ONES[o]}`)
      else parts.push(TENS[t])
    }
  }
  return parts.join(' و ')
}

/**
 * Convert integer amount to Persian words.
 * Example: 1500000 -> "یک میلیون و پانصد هزار"
 */
export function numberToPersianWords(value: unknown) {
  const digits = onlyDigits(value)
  if (!digits) return ''
  // limit to safe integer range for display
  if (digits.length > 15) return 'مبلغ بسیار بزرگ است'

  let n = Number(digits)
  if (!Number.isFinite(n) || n < 0) return ''
  if (n === 0) return 'صفر'

  const parts: string[] = []
  let scale = 0
  while (n > 0 && scale < SCALES.length) {
    const chunk = n % 1000
    if (chunk) {
      const words = threeDigitsToWords(chunk)
      const scaleName = SCALES[scale]
      parts.unshift(scaleName ? `${words} ${scaleName}` : words)
    }
    n = Math.floor(n / 1000)
    scale += 1
  }
  return parts.join(' و ')
}

/** Live label for money fields */
export function amountToPersianTomanLabel(value: unknown) {
  const words = numberToPersianWords(value)
  if (!words) return ''
  if (words === 'مبلغ بسیار بزرگ است') return words
  return `مبلغ ${words} تومان`
}
