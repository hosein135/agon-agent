import type { AdminUser, CountMap } from '../types'
import { onlyDigits, toEnglishDigits } from './digits'

type CountsResponse = {
  counts?: CountMap
  unread_total?: number
  error?: string
  messages?: Array<Record<string, unknown>>
}

export async function fetchMessageCounts(audience_type: string, audience_keys: string | string[]) {
  if (!audience_type) return { counts: {} as CountMap, unread_total: 0 }
  const keys = Array.isArray(audience_keys)
    ? audience_keys.filter(Boolean).map(String)
    : audience_keys
      ? [String(audience_keys)]
      : []
  if (!keys.length) return { counts: {} as CountMap, unread_total: 0 }

  const params = new URLSearchParams({
    audience_type,
    audience_keys: keys.join(','),
    counts_only: '1',
  })
  const res = await fetch(`/api/messages?${params.toString()}`)
  const data = (await res.json()) as CountsResponse
  if (!res.ok) throw new Error(data.error || 'خطا در دریافت پیام‌ها')
  return {
    counts: data.counts || {},
    unread_total: data.unread_total || 0,
  }
}

export function mergeCounts(...parts: Array<CountMap | undefined>) {
  const merged: CountMap = {}
  for (const p of parts) {
    for (const [k, v] of Object.entries(p || {})) {
      merged[k] = (merged[k] || 0) + (Number(v) || 0)
    }
  }
  return merged
}

export function sumTabCounts(counts: CountMap = {}, tabKeys: string[] = []) {
  return (tabKeys || []).reduce((s, k) => s + (Number(counts[k]) || 0), 0)
}

export async function fetchMessages(audience_type: string, audience_key: string) {
  const params = new URLSearchParams({ audience_type, audience_key })
  const res = await fetch(`/api/messages?${params.toString()}`)
  const data = (await res.json()) as CountsResponse
  if (!res.ok) throw new Error(data.error || 'خطا در دریافت پیام‌ها')
  return data
}

export async function markTabRead(audience_type: string, audience_key: string, tab_key = 'messages') {
  return markTabsRead(audience_type, [audience_key], [tab_key])
}

/** علامت‌خواندن چند تب و چند کلید مخاطب در یک درخواست */
export async function markTabsRead(
  audience_type: string,
  audience_keys: Array<string | null | undefined> = [],
  tab_keys: string[] = [],
) {
  const keys = Array.from(new Set((audience_keys || []).filter(Boolean).map(String)))
  const tabs = Array.from(new Set((tab_keys || []).filter(Boolean).map(String)))
  if (!audience_type || !keys.length) return { ok: true as const }

  const res = await fetch('/api/messages', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mark_all: true,
      audience_type,
      audience_keys: keys,
      tab_keys: tabs.length ? tabs : undefined,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean }
  if (!res.ok) throw new Error(data.error || 'خطا در خواندن پیام')
  return data
}

export function blockManagerAudienceKeys(admin?: AdminUser | null) {
  if (!admin) return [] as string[]
  const dir = String(admin.block_direction || '')
  const raw = String(admin.block_number ?? '')
  const en = onlyDigits(raw) || toEnglishDigits(raw)
  const set = new Set<string>()
  if (raw) set.add(`${raw}|${dir}`)
  if (en) set.add(`${en}|${dir}`)
  for (const k of Array.from(set)) set.add(k.replace(/\s+/g, ''))
  return Array.from(set)
}

/** نگاشت زیرتب UI مدیر بلوک → tab_key پیام‌ها */
export const BLOCK_SUB_TAB_KEYS: Record<string, string[]> = {
  residents_list: [],
  residents_chat: ['private_chat'],
  public_chat: ['public_chat'],
  complex_chat: ['staff_chat', 'complex_chat'],
  board_work: ['work_orders', 'board'],
  bills_create: ['bills'],
  receipts: ['receipts'],
  block_expenses: ['finance'],
  finance_status: ['finance'],
  messages_panel: [],
  units_table: [],
  excel_import: [],
  excel_export: [],
  backup_data: [],
  restore_data: [],
  app_link: [],
  install_app: [],
}

export const RESIDENT_TAB_KEYS: Record<string, string[]> = {
  bills: ['bills', 'receipts'],
  finance: ['finance'],
  manager_chat: ['private_chat', 'manager_chat'],
  public_chat: ['public_chat'],
  app_link: [],
  install_app: [],
  block_finance: ['finance'],
}

export const COMPLEX_TAB_KEYS: Record<string, string[]> = {
  requests: ['requests', 'membership'],
  blocks_list: [],
  block_chat: ['private_chat', 'staff_chat', 'complex_chat'],
  system_chat: ['system_chat', 'complex_chat'],
  residents_all: ['residents'],
  public_chat: ['public_chat'],
  bills_overview: ['bills', 'receipts', 'finance'],
  finance_blocks: ['finance', 'bills', 'receipts'],
  finance_hint: ['finance'],
  board_members: ['board'],
  board_work_orders: ['work_orders', 'board'],
  people_directory: [],
  io_hint: [],
  messages: ['messages'],
  info: [],
  private_chat: ['private_chat'],
  bills: ['bills', 'receipts'],
}

export const SYSTEM_TAB_KEYS: Record<string, string[]> = {
  complex: ['complex'],
  complexes_list: [],
  complex_chat: ['complex_chat', 'system_chat'],
  membership: ['membership', 'requests'],
  residents: ['residents'],
  messages: ['messages'],
  blocks_list: [],
  finance_overview: ['bills', 'receipts', 'finance'],
}

export async function markMessageRead(id: number) {
  const res = await fetch('/api/messages', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  const data = (await res.json()) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'خطا در خواندن پیام')
  return data
}
