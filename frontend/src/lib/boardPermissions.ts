export const PERMISSION_DEFS = [
  { key: 'chat_complex_manager', label: 'ارتباط با مدیر مجتمع' },
  { key: 'chat_block_managers', label: 'ارتباط با مدیران بلوک' },
  { key: 'chat_residents', label: 'ارتباط با ساکنین' },
  { key: 'view_finance', label: 'مشاهده امور مالی مجتمع' },
  { key: 'finance_reports', label: 'گزارش‌های مالی و بررسی' },
  { key: 'notify_block_managers_finance', label: 'اطلاع‌رسانی مالی به مدیر بلوک' },
  { key: 'receive_work_orders', label: 'دریافت درخواست تعمیر/کار' },
  { key: 'manage_work_orders', label: 'پیگیری و انجام درخواست‌ها' },
  { key: 'view_blocks', label: 'مشاهده لیست بلوک‌ها' },
  { key: 'view_residents', label: 'مشاهده فهرست ساکنین' },
] as const

export type PermissionKey = (typeof PERMISSION_DEFS)[number]['key']
export type PermissionMap = Record<PermissionKey, boolean>

export const DEFAULT_PERMISSIONS: PermissionMap = Object.fromEntries(
  PERMISSION_DEFS.map((p) => [p.key, false]),
) as PermissionMap

export const ROLE_PRESETS: Record<string, Partial<PermissionMap>> = {
  'مسئول مالی': {
    chat_complex_manager: true,
    chat_block_managers: true,
    chat_residents: false,
    view_finance: true,
    finance_reports: true,
    notify_block_managers_finance: true,
    receive_work_orders: false,
    manage_work_orders: false,
    view_blocks: true,
    view_residents: true,
  },
  'مسئول تأسیسات': {
    chat_complex_manager: true,
    chat_block_managers: true,
    chat_residents: false,
    view_finance: false,
    finance_reports: false,
    notify_block_managers_finance: false,
    receive_work_orders: true,
    manage_work_orders: true,
    view_blocks: true,
    view_residents: true,
  },
  برقکار: {
    chat_complex_manager: true,
    chat_block_managers: true,
    chat_residents: false,
    view_finance: false,
    finance_reports: false,
    notify_block_managers_finance: false,
    receive_work_orders: true,
    manage_work_orders: true,
    view_blocks: true,
    view_residents: false,
  },
  'مسئول نگهبانی': {
    chat_complex_manager: true,
    chat_block_managers: true,
    chat_residents: true,
    view_finance: false,
    finance_reports: false,
    notify_block_managers_finance: false,
    receive_work_orders: true,
    manage_work_orders: false,
    view_blocks: true,
    view_residents: true,
  },
}

export function permissionsForTitle(title: unknown, custom: Partial<PermissionMap> | null = null) {
  const preset = ROLE_PRESETS[String(title || '').trim()] || {}
  const base: PermissionMap = {
    ...DEFAULT_PERMISSIONS,
    chat_complex_manager: true,
    view_blocks: true,
    ...preset,
  }
  if (custom && typeof custom === 'object') {
    for (const k of Object.keys(DEFAULT_PERMISSIONS) as PermissionKey[]) {
      if (custom[k] != null) base[k] = Boolean(custom[k])
    }
  }
  return base
}

export function hasPerm(member: { permissions?: Partial<PermissionMap> } | null | undefined, key: PermissionKey) {
  const p = member?.permissions || {}
  return Boolean(p[key])
}
