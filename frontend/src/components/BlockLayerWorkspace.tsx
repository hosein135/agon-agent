import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users,
  MessageSquare,
  MessagesSquare,
  Landmark,
  Wallet,
  Receipt,
  FileCheck2,
  ArrowLeftRight,
  FileSpreadsheet,
  Table2,
  HardDriveDownload,
  HardDriveUpload,
  List,
  Shield,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import { BLOCK_SUB_TAB_KEYS, fetchMessageCounts, markTabsRead, blockManagerAudienceKeys } from '../lib/messages'
import SlideDropdownMenu from './SlideDropdownMenu'
import ResidentsManager from './ResidentsManager'
import ManagerPrivateInbox from './ManagerPrivateInbox'
import PublicChat from './PublicChat'
import StaffChat from './StaffChat'
import ManagerBillsTools from './ManagerBillsTools'
import ManagerReceipts from './ManagerReceipts'
import BlockFinanceTab from './BlockFinanceTab'
import BlockExpenses from './BlockExpenses'
import ManagerUnitsReport from './ManagerUnitsReport'
import UnitsExcelTools from './UnitsExcelTools'
import ManagerBackupRestore from './ManagerBackupRestore'
import type { AdminUser, MenuSection } from '../types'

function sameBlock(a, b) {
  const an = onlyDigits(a?.block_number) || toEnglishDigits(a?.block_number || '')
  const bn = onlyDigits(b?.block_number) || toEnglishDigits(b?.block_number || '')
  return an && bn && an === bn && String(a?.block_direction || '') === String(b?.block_direction || '')
}

/**
 * لایه عملیاتی یک بلوک — همان تب‌های مدیر بلوک
 * viewerRole: block_manager | complex_manager | system_admin
 */
export default function BlockLayerWorkspace({
  blockAdmin,
  viewerRole = 'block_manager',
  viewerName = 'مدیر',
  showComplexChat = true,
  extraSections = [],
}: {
  blockAdmin: AdminUser
  viewerRole?: string
  viewerName?: string
  showComplexChat?: boolean
  extraSections?: MenuSection[]
}) {
  const [residents, setResidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [activeSection, setActiveSection] = useState('residents_section')
  const [subTab, setSubTab] = useState('residents_list')
  const [counts, setCounts] = useState({})

  const admin = useMemo(
    () => ({
      ...blockAdmin,
      role: 'block_manager',
      full_name: blockAdmin?.full_name || `مدیر بلوک ${blockAdmin?.block_number} ${blockAdmin?.block_direction}`,
    }),
    [blockAdmin],
  )

  const sections = useMemo(() => {
    const base = [
      {
        id: 'residents_section',
        label: 'ساکنین',
        icon: Users,
        subs: [
          { id: 'residents_list', label: 'لیست ساکنین', desc: 'مشاهده و مدیریت واحدها', icon: List },
          { id: 'residents_chat', label: 'ارتباط با ساکنین', desc: 'چت خصوصی متنی و صوتی', icon: MessageSquare },
          { id: 'public_chat', label: 'چت عمومی', desc: 'گفتگوی عمومی ساکنین', icon: MessagesSquare },
          ...(showComplexChat
            ? [
                {
                  id: 'complex_chat',
                  label:
                    viewerRole === 'block_manager'
                      ? 'ارتباط با مدیر مجتمع'
                      : viewerRole === 'complex_manager'
                        ? 'گفتگو به‌عنوان مدیر مجتمع'
                        : 'گفتگوی بلوک ↔ مجتمع',
                  desc: 'ارتباط سلسله‌مراتبی',
                  icon: Landmark,
                },
              ]
            : []),
        ],
      },
      {
        id: 'finance_section',
        label: 'امور مالی',
        icon: Wallet,
        subs: [
          { id: 'bills_create', label: 'ثبت قبض', desc: 'صدور قبض برای واحدها', icon: Receipt },
          { id: 'receipts', label: 'رسید دریافتی', desc: 'ثبت و پیگیری دریافت‌ها', icon: FileCheck2 },
          {
            id: 'block_expenses',
            label: 'خرج‌کرد بلوک',
            desc: 'ثبت مخارج به‌صورت فاکتور',
            icon: Receipt,
          },
          { id: 'finance_status', label: 'وضعیت مالی', desc: 'گزارش شفاف مالی بلوک', icon: Wallet },
        ],
      },
      {
        id: 'io_section',
        label: 'خروجی و ورودی',
        icon: ArrowLeftRight,
        subs: [
          { id: 'units_table', label: 'جدول واحدها', desc: 'نمایش جدولی واحدها', icon: Table2 },
          { id: 'excel_import', label: 'ورود اطلاعات از اکسل', desc: 'آپلود و صدور قبض', icon: FileSpreadsheet },
          { id: 'excel_export', label: 'خروجی اکسل', desc: 'Export', icon: FileSpreadsheet },
          { id: 'backup_data', label: 'پشتیبان‌گیری', desc: 'ذخیره روی دستگاه', icon: HardDriveDownload },
          { id: 'restore_data', label: 'بازیابی از پشتیبان', desc: 'برگرداندن اطلاعات', icon: HardDriveUpload },
        ],
      },
      ...extraSections,
    ]
    return base
  }, [extraSections, showComplexChat, viewerRole])

  const refreshCounts = useCallback(async () => {
    if (!admin?.block_number) return
    try {
      const keys = blockManagerAudienceKeys(admin)
      const data = await fetchMessageCounts('block_manager', keys)
      setCounts(data.counts || {})
    } catch {
      /* ignore */
    }
  }, [admin])

  const loadResidents = useCallback(async () => {
    if (!admin?.block_number) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/residents')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت ساکنین')
      const list = Array.isArray(data) ? data : []
      setResidents(list.filter((r) => sameBlock(r, admin)))
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }, [admin])

  useEffect(() => {
    loadResidents()
    refreshCounts()
    const t = setInterval(refreshCounts, 15000)
    return () => clearInterval(t)
  }, [loadResidents, refreshCounts])

  const openSub = async (sectionId, subId) => {
    setActiveSection(sectionId)
    setSubTab(subId)
    setOpenMenuId(null)
    const tabKeys = BLOCK_SUB_TAB_KEYS[subId] || []
    if (tabKeys.length) {
      setCounts((prev) => {
        const next = { ...prev }
        for (const k of tabKeys) next[k] = 0
        return next
      })
      try {
        await markTabsRead('block_manager', blockManagerAudienceKeys(admin), tabKeys)
        await refreshCounts()
      } catch {
        /* ignore */
      }
    }
  }

  const subBadge = (subId) => {
    const keys = BLOCK_SUB_TAB_KEYS[subId]
    if (!keys?.length) return 0
    return keys.reduce((s, k) => (k === 'messages' ? s : s + (Number(counts[k]) || 0)), 0)
  }

  const sectionBadge = (sectionId) => {
    if (sectionId === 'residents_section') {
      return subBadge('residents_chat') + subBadge('public_chat') + subBadge('complex_chat')
    }
    if (sectionId === 'finance_section') {
      return subBadge('bills_create') + subBadge('receipts') + subBadge('finance_status')
    }
    return 0
  }

  const publicUser = {
    unit_name: `ناظر-${admin.block_number}-${admin.block_direction}`,
    first_name: viewerName || 'ناظر',
    last_name: viewerRole === 'system_admin' ? 'سیستم' : viewerRole === 'complex_manager' ? 'مجتمع' : 'بلوک',
    block_number: admin.block_number,
    block_direction: admin.block_direction,
  }

  const staffRole =
    viewerRole === 'complex_manager'
      ? 'complex_manager'
      : viewerRole === 'system_admin'
        ? 'complex_manager'
        : 'block_manager'

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50/80 px-3.5 py-2.5 text-xs font-bold text-emerald-950 flex items-center gap-2">
        <Shield className="w-4 h-4 shrink-0" />
        لایه بلوک {admin.block_number} {admin.block_direction}
        {viewerRole !== 'block_manager' && (
          <span className="text-emerald-800">— ورود نظارتی از {viewerRole === 'system_admin' ? 'مدیر سیستم' : 'مدیر مجتمع'}</span>
        )}
      </div>

      {error && (
        <div className="msg-error rounded-xl px-4 py-3 text-sm font-semibold">{error}</div>
      )}

      <SlideDropdownMenu
        sections={sections}
        openId={openMenuId}
        activeSubId={subTab}
        onToggle={(id) => setOpenMenuId((p) => (p === id ? null : id))}
        onSelectSub={(sectionId, subId) => openSub(sectionId, subId)}
        getSectionBadge={(section) => sectionBadge(section.id)}
        getSubBadge={(sub) => subBadge(sub.id)}
      />

      <div className="bm-main-panel">
        {activeSection === 'residents_section' && subTab === 'residents_list' && (
          <ResidentsManager
            admin={admin}
            residents={residents}
            loading={loading}
            onChanged={loadResidents}
          />
        )}
        {activeSection === 'residents_section' && subTab === 'residents_chat' && (
          <ManagerPrivateInbox admin={admin} residents={residents} onChanged={refreshCounts} />
        )}
        {activeSection === 'residents_section' && subTab === 'public_chat' && (
          <PublicChat user={publicUser} onChanged={refreshCounts} />
        )}
        {activeSection === 'residents_section' && subTab === 'complex_chat' && showComplexChat && (
          <StaffChat
            block_number={admin.block_number}
            block_direction={admin.block_direction}
            sender_role={staffRole}
            sender_name={viewerName || admin.full_name || 'مدیر'}
          />
        )}
        {activeSection === 'finance_section' && subTab === 'bills_create' && (
          <ManagerBillsTools admin={admin} residents={residents} onChanged={refreshCounts} />
        )}
        {activeSection === 'finance_section' && subTab === 'receipts' && (
          <ManagerReceipts admin={admin} onChanged={refreshCounts} />
        )}
        {activeSection === 'finance_section' && subTab === 'block_expenses' && (
          <BlockExpenses
            admin={admin}
            onChanged={refreshCounts}
            shareMode={(() => {
              try {
                return new URLSearchParams(window.location.search).get('share') === '1'
              } catch {
                return false
              }
            })()}
          />
        )}
        {activeSection === 'finance_section' && subTab === 'finance_status' && (
          <BlockFinanceTab
            user={{
              unit_name: '',
              block_number: admin.block_number,
              block_direction: admin.block_direction,
            }}
          />
        )}
        {activeSection === 'io_section' && subTab === 'units_table' && (
          <ManagerUnitsReport admin={admin} residents={residents} />
        )}
        {activeSection === 'io_section' && subTab === 'excel_import' && (
          <UnitsExcelTools admin={admin} residents={residents} onImported={loadResidents} mode="import" />
        )}
        {activeSection === 'io_section' && subTab === 'excel_export' && (
          <UnitsExcelTools admin={admin} residents={residents} mode="export" />
        )}
        {activeSection === 'io_section' && subTab === 'backup_data' && (
          <ManagerBackupRestore admin={admin} mode="backup" />
        )}
        {activeSection === 'io_section' && subTab === 'restore_data' && (
          <ManagerBackupRestore admin={admin} mode="restore" onRestored={loadResidents} />
        )}
      </div>
    </div>
  )
}
