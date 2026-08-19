import type { Bill, FinanceRow } from '../types'

/** وضعیت پرداخت: پرداخت‌شده سبز، در انتظار تایید کهربایی، بقیه قرمز. */

function normStatus(status: unknown) {
  return String(status || '')
    .replace(/[\u200c\u200d\u200e\u200f\u00a0]/g, '')
    .replace(/[-–—_]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase()
}

export function isBillPaid(status: unknown) {
  const s = normStatus(status)
  return s === 'پرداختشده' || s === 'paid' || s.includes('پرداختشده')
}

export function isBillPending(status: unknown) {
  const s = normStatus(status)
  return s === 'درانتظارتایید' || s.includes('انتظار') || s === 'pending'
}

export function isBillUnpaid(status: unknown) {
  return !isBillPaid(status) && !isBillPending(status)
}

export function billStatusLabel(status: unknown) {
  if (isBillPaid(status)) return 'پرداخت شده'
  if (isBillPending(status)) return 'در انتظار تایید رسید'
  return 'پرداخت نشده'
}

export function billStatusClass(status: unknown) {
  if (isBillPaid(status)) return 'pay-status is-paid'
  if (isBillPending(status)) return 'pay-status is-pending'
  return 'pay-status is-unpaid'
}

/** unpaid first, then pending, then paid; newer first within group */
export function sortBillsUnpaidFirst<T extends Pick<Bill, 'status' | 'created_at' | 'due_date'>>(
  list: T[] = [],
) {
  const rank = (status: unknown) => {
    if (isBillUnpaid(status)) return 0
    if (isBillPending(status)) return 1
    if (isBillPaid(status)) return 2
    return 0
  }
  return [...list].sort((a, b) => {
    const ra = rank(a.status)
    const rb = rank(b.status)
    if (ra !== rb) return ra - rb
    const ta = new Date(a.created_at || a.due_date || 0).getTime()
    const tb = new Date(b.created_at || b.due_date || 0).getTime()
    return tb - ta
  })
}

/** rows with debt first for block finance tables */
export function sortFinanceDebtFirst<T extends FinanceRow>(list: T[] = []) {
  return [...list].sort((a, b) => {
    const ad = Number(a.debt_amount || 0) > 0 ? 0 : 1
    const bd = Number(b.debt_amount || 0) > 0 ? 0 : 1
    if (ad !== bd) return ad - bd
    return Number(b.debt_amount || 0) - Number(a.debt_amount || 0)
  })
}
