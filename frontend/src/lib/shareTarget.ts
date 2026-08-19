/** مدیریت فایل/متن اشتراک‌گذاری‌شده از اپ‌های پرداخت به بخش رسید */

const PENDING_KEY = 'block7_share_target_pending_v2'
const SELECTED_BILL_KEY = 'block7_share_selected_bill_v1'
const SELECTED_EXPENSE_KEY = 'block7_share_selected_expense_v1'

function safeParse(raw: string | null) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function storageSet(key: string, value: unknown) {
  const raw = JSON.stringify(value || {})
  try {
    sessionStorage.setItem(key, raw)
    return true
  } catch {
    try {
      localStorage.setItem(key, raw)
      return true
    } catch {
      return false
    }
  }
}

function storageGet(key: string) {
  try {
    const s = sessionStorage.getItem(key)
    if (s) return safeParse(s)
  } catch {
    /* ignore */
  }
  try {
    return safeParse(localStorage.getItem(key))
  } catch {
    return null
  }
}

function storageRemove(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** فشرده‌سازی سبک dataURL قبل از ذخیره در storage (برای جلوگیری از quota) */
async function shrinkDataUrlForStorage(dataUrl: string, maxChars = 900_000) {
  if (!dataUrl || typeof dataUrl !== 'string') return ''
  if (dataUrl.length <= maxChars) return dataUrl
  if (!dataUrl.startsWith('data:image/')) {
    // غیرتصویر بزرگ را ذخیره نکن
    return dataUrl.length <= maxChars ? dataUrl : ''
  }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = reject
      im.src = dataUrl
    })
    let w = img.naturalWidth || img.width || 1
    let h = img.naturalHeight || img.height || 1
    const scale = Math.min(1, 1100 / Math.max(w, h))
    w = Math.max(1, Math.round(w * scale))
    h = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    let q = 0.7
    let out = dataUrl
    for (let i = 0; i < 8; i++) {
      canvas.width = w
      canvas.height = h
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      out = canvas.toDataURL('image/jpeg', q)
      if (out.length <= maxChars) break
      if (q > 0.4) q -= 0.1
      else {
        w = Math.max(240, Math.round(w * 0.75))
        h = Math.max(240, Math.round(h * 0.75))
      }
    }
    return out.length <= maxChars * 1.05 ? out : ''
  } catch {
    return ''
  }
}

import type { SharePayload } from '../types'

export async function setPendingSharePayload(payload?: Partial<SharePayload> | null) {
  const p: SharePayload = { ...(payload || {}) }
  if (p.fileDataUrl) {
    const shrunk = await shrinkDataUrlForStorage(p.fileDataUrl)
    p.fileDataUrl = shrunk
    if (shrunk && !String(p.fileName || '').match(/\.(jpe?g|png|webp)$/i)) {
      p.fileName = (String(p.fileName || 'receipt').replace(/\.\w+$/, '') || 'receipt') + '.jpg'
      p.fileType = 'image/jpeg'
    }
    if (!shrunk) {
      p.tooLarge = true
      p.fileDataUrl = ''
    }
  }
  p.savedAt = Date.now()
  const ok = storageSet(PENDING_KEY, p)
  if (!ok && p.fileDataUrl) {
    // آخرین تلاش: بدون فایل فقط متادیتا
    storageSet(PENDING_KEY, { ...p, fileDataUrl: '', tooLarge: true })
  }
  return p
}

export function getPendingSharePayload() {
  return storageGet(PENDING_KEY)
}

export function clearPendingSharePayload() {
  storageRemove(PENDING_KEY)
}

export function hasPendingSharePayload() {
  const p = getPendingSharePayload()
  return Boolean(p && (p.fileDataUrl || p.text || p.title || p.url))
}

export function setSelectedBillForShare(billId: number | string | null | undefined) {
  try {
    if (billId == null) storageRemove(SELECTED_BILL_KEY)
    else storageSet(SELECTED_BILL_KEY, { id: billId })
  } catch {
    /* ignore */
  }
}

export function getSelectedBillForShare() {
  const p = storageGet(SELECTED_BILL_KEY)
  if (!p) return null
  if (typeof p === 'object' && p.id != null) return Number(p.id)
  const n = Number(p)
  return Number.isFinite(n) ? n : null
}

export function clearSelectedBillForShare() {
  storageRemove(SELECTED_BILL_KEY)
}

export function setSelectedExpenseForShare(invoiceId: number | string | null | undefined) {
  try {
    if (invoiceId == null) storageRemove(SELECTED_EXPENSE_KEY)
    else storageSet(SELECTED_EXPENSE_KEY, { id: invoiceId })
  } catch {
    /* ignore */
  }
}

export function getSelectedExpenseForShare() {
  const p = storageGet(SELECTED_EXPENSE_KEY)
  if (!p) return null
  if (typeof p === 'object' && p.id != null) return Number(p.id)
  const n = Number(p)
  return Number.isFinite(n) ? n : null
}

export function clearSelectedExpenseForShare() {
  storageRemove(SELECTED_EXPENSE_KEY)
}

/** dataURL -> File */
export async function dataUrlToFile(dataUrl: string, fileName = 'receipt-share.jpg') {
  if (!dataUrl || typeof dataUrl !== 'string') throw new Error('فایل خالی است')
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  if (!blob || blob.size < 10) throw new Error('فایل اشتراک‌گذاری‌شده نامعتبر است')
  const type = blob.type || (dataUrl.startsWith('data:application/pdf') ? 'application/pdf' : 'image/jpeg')
  let name = fileName || `receipt-${Date.now()}.jpg`
  if (type.includes('jpeg') || type.includes('jpg')) {
    if (!/\.jpe?g$/i.test(name)) name = name.replace(/\.\w+$/, '') + '.jpg'
  } else if (type.includes('png') && !/\.png$/i.test(name)) {
    name = name.replace(/\.\w+$/, '') + '.png'
  } else if (type.includes('pdf') && !/\.pdf$/i.test(name)) {
    name = name.replace(/\.\w+$/, '') + '.pdf'
  }
  return new File([blob], name, { type })
}

export function isShareTargetPath(pathname = window.location.pathname) {
  return String(pathname || '').replace(/\/+$/, '') === '/share-target'
}
