'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from '../lib/nav'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2,
  LogOut,
  Users,
  AlertCircle,
  MessageSquare,
  CircleHelp,
  Palette,
  X,
  CheckCircle2,
  Clock3,
  Wallet,
  List,
  MessagesSquare,
  Landmark,
  Receipt,
  FileCheck2,
  ArrowLeftRight,
  FileSpreadsheet,
  Table2,
  Link2,
  Download,
  KeyRound,
  HardDriveDownload,
  HardDriveUpload,
  Wrench,
  Images,
} from 'lucide-react'
import { clearSession, getSession, saveSession } from '../lib/session'
import { toEnglishDigits } from '../lib/digits'
import {
  fetchMessageCounts,
  markTabsRead,
  blockManagerAudienceKeys,
  BLOCK_SUB_TAB_KEYS,
} from '../lib/messages'
import ManagerBillsTools from '../components/ManagerBillsTools'
import ManagerPrivateInbox from '../components/ManagerPrivateInbox'
import PublicChat from '../components/PublicChat'
import StaffChat from '../components/StaffChat'
import ManagerReceipts from '../components/ManagerReceipts'
import UnitsExcelTools from '../components/UnitsExcelTools'
import ManagerUnitsReport from '../components/ManagerUnitsReport'
import ManagerBackupRestore from '../components/ManagerBackupRestore'
import ResidentsManager from '../components/ResidentsManager'
import BlockFinanceTab from '../components/BlockFinanceTab'
import BlockExpenses from '../components/BlockExpenses'
import SlideDropdownMenu from '../components/SlideDropdownMenu'
import AppLinkTab from '../components/AppLinkTab'
import InstallAppTab from '../components/InstallAppTab'
import BoardWorkOrders from '../components/BoardWorkOrders'
import ManagerUploads from '../components/ManagerUploads'

const DESIGN_KEY = 'block7_block_admin_design_v3'

const MAIN_SECTIONS = [
  {
    id: 'residents_section',
    label: 'ساکنین',
    icon: Users,
    subs: [
      { id: 'residents_list', label: 'لیست ساکنین', desc: 'مشاهده و مدیریت واحدها', icon: List },
      { id: 'residents_chat', label: 'ارتباط با ساکنین', desc: 'چت خصوصی متنی و صوتی', icon: MessageSquare },
      { id: 'public_chat', label: 'چت عمومی', desc: 'گفتگوی عمومی ساکنین', icon: MessagesSquare },
      { id: 'complex_chat', label: 'ارتباط با مدیر مجتمع', desc: 'پیام به مدیر مجتمع', icon: Landmark },
      {
        id: 'board_work',
        label: 'درخواست به هیئت مدیره',
        desc: 'تعمیرات برای مسئول تأسیسات و …',
        icon: Wrench,
      },
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
        desc: 'ثبت مخارج به‌صورت فاکتور چندردیفه',
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
      { id: 'excel_import', label: 'ورود اطلاعات از اکسل', desc: 'آپلود اکسل، شناسایی ستون‌ها و صدور قبض', icon: FileSpreadsheet },
      { id: 'excel_export', label: 'خروجی اکسل', desc: 'Export فایل CSV/Excel', icon: FileSpreadsheet },
      { id: 'backup_data', label: 'پشتیبان‌گیری', desc: 'ذخیره اطلاعات روی دستگاه', icon: HardDriveDownload },
      { id: 'restore_data', label: 'بازیابی از پشتیبان', desc: 'برگرداندن اطلاعات ذخیره‌شده', icon: HardDriveUpload },
      { id: 'uploads_browser', label: 'فایل‌های آپلود شده', desc: 'رسید، فاکتور و صوت — نگهداری ۶۰ روز', icon: Images },
    ],
  },
]

const NEON_COLORS = [
  { id: 'neon-pink', hex: '#ff2bd6', label: 'نئون صورتی' },
  { id: 'neon-magenta', hex: '#ff00aa', label: 'نئون سرخابی' },
  { id: 'neon-purple', hex: '#b026ff', label: 'نئون بنفش' },
  { id: 'neon-blue', hex: '#1f6bff', label: 'نئون آبی' },
  { id: 'neon-cyan', hex: '#00f0ff', label: 'نئون فیروزه‌ای' },
  { id: 'neon-green', hex: '#39ff14', label: 'نئون سبز' },
  { id: 'neon-lime', hex: '#ccff00', label: 'نئون لیمویی' },
  { id: 'neon-yellow', hex: '#ffe600', label: 'نئون زرد' },
  { id: 'neon-orange', hex: '#ff6a00', label: 'نئون نارنجی' },
  { id: 'neon-red', hex: '#ff1744', label: 'نئون قرمز' },
]

const BASE_COLORS = {
  tabs: [
    { id: 'indigo', hex: '#4f46e5', label: 'نیلی' },
    { id: 'blue', hex: '#2563eb', label: 'آبی' },
    { id: 'sky', hex: '#0284c7', label: 'آسمانی' },
    { id: 'teal', hex: '#0d9488', label: 'فیروزه‌ای' },
    { id: 'emerald', hex: '#059669', label: 'سبز' },
    { id: 'violet', hex: '#7c3aed', label: 'بنفش' },
    { id: 'fuchsia', hex: '#c026d3', label: 'ارغوانی' },
    { id: 'rose', hex: '#e11d48', label: 'سرخابی' },
    { id: 'orange', hex: '#ea580c', label: 'نارنجی' },
    { id: 'zinc', hex: '#3f3f46', label: 'ذغالی' },
  ],
  backlight: [
    { id: 'violet', hex: '#a78bfa', label: 'بنفش' },
    { id: 'indigo', hex: '#818cf8', label: 'نیلی' },
    { id: 'sky', hex: '#38bdf8', label: 'آسمانی' },
    { id: 'cyan', hex: '#22d3ee', label: 'فیروزه' },
    { id: 'emerald', hex: '#34d399', label: 'سبز' },
    { id: 'fuchsia', hex: '#e879f9', label: 'ارغوانی' },
    { id: 'pink', hex: '#f472b6', label: 'صورتی' },
    { id: 'amber', hex: '#fbbf24', label: 'کهربایی' },
    { id: 'rose', hex: '#fb7185', label: 'سرخابی' },
    { id: 'white', hex: '#ffffff', label: 'سفید' },
  ],
  background: [
    { id: 'zinc', hex: '#f4f4f5', label: 'خاکستری' },
    { id: 'indigo', hex: '#e0e7ff', label: 'نیلی' },
    { id: 'sky', hex: '#e0f2fe', label: 'آسمانی' },
    { id: 'violet', hex: '#ede9fe', label: 'بنفش' },
    { id: 'teal', hex: '#ccfbf1', label: 'فیروزه‌ای' },
    { id: 'rose', hex: '#ffe4e6', label: 'سرخابی' },
    { id: 'amber', hex: '#fef3c7', label: 'کهربایی' },
    { id: 'emerald', hex: '#d1fae5', label: 'سبز' },
    { id: 'mist', hex: '#e4e4e7', label: 'سنگی' },
    { id: 'white', hex: '#ffffff', label: 'سفید' },
  ],
}

const DESIGN_COLORS = {
  tabs: [...BASE_COLORS.tabs, ...NEON_COLORS],
  backlight: [...BASE_COLORS.backlight, ...NEON_COLORS],
  background: [...BASE_COLORS.background, ...NEON_COLORS],
}

const DEFAULT_DESIGN = {
  tabs: '#4f46e5',
  backlight: '#a78bfa',
  background: '#f4f4f5',
}

function loadDesign() {
  try {
    const raw = localStorage.getItem(DESIGN_KEY)
    if (!raw) return { ...DEFAULT_DESIGN }
    const parsed = JSON.parse(raw)
    return {
      tabs: parsed.tabs || DEFAULT_DESIGN.tabs,
      backlight: parsed.backlight || DEFAULT_DESIGN.backlight,
      background: parsed.background || DEFAULT_DESIGN.background,
    }
  } catch {
    return { ...DEFAULT_DESIGN }
  }
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return { r: 79, g: 70, b: 229 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function mixHex(hex, withWhite = 0.35) {
  const { r, g, b } = hexToRgb(hex)
  const m = (c) => Math.round(c + (255 - c) * withWhite)
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`
}

function darkenHex(hex, amount = 0.25) {
  const { r, g, b } = hexToRgb(hex)
  const d = (c) => Math.max(0, Math.round(c * (1 - amount)))
  return `rgb(${d(r)}, ${d(g)}, ${d(b)})`
}

function designToCssVars(design) {
  const tab = design.tabs
  const light = design.backlight
  const bg = design.background
  const lr = hexToRgb(light)
  return {
    '--up-bg': `radial-gradient(1200px 620px at 100% -8%, ${mixHex(tab, 0.82)} 0%, transparent 52%), radial-gradient(900px 520px at 0% 110%, ${mixHex(light, 0.78)} 0%, transparent 58%), linear-gradient(180deg, ${mixHex(bg, 0.92)} 0%, ${mixHex(bg, 0.55)} 100%)`,
    '--up-tab': tab,
    '--up-tab-soft': mixHex(tab, 0.9),
    '--up-tab-mid': mixHex(tab, 0.7),
    '--up-tab-text': '#3f3f46',
    '--up-tab-active': `linear-gradient(180deg, ${mixHex(tab, 0.12)} 0%, ${tab} 48%, ${darkenHex(tab, 0.18)} 100%)`,
    '--up-glow': light,
    '--up-glow-soft': `rgba(${lr.r}, ${lr.g}, ${lr.b}, 0.18)`,
    '--up-border': 'rgba(24, 24, 27, 0.08)',
  } as CSSProperties
}

export default function BlockAdminPanel() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [requests, setRequests] = useState<any[]>([])
  const [residents, setResidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null) // dropdown panel open id (null = closed)
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab')
      if (t === 'block_expenses') return 'finance_section'
    } catch {
      /* ignore */
    }
    return 'residents_section'
  })
  const [subTab, setSubTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('tab') || 'public_chat'
    } catch {
      return 'public_chat'
    }
  })
  const [expenseShareMode, setExpenseShareMode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('share') === '1'
    } catch {
      return false
    }
  })
  const [counts, setCounts] = useState({})
  const [helpOpen, setHelpOpen] = useState(false)
  const [designOpen, setDesignOpen] = useState(false)
  const [design, setDesign] = useState(() => loadDesign())
  const [designSection, setDesignSection] = useState('background')
  const [excelMode, setExcelMode] = useState('both') // import | export | both
  const [pinOpen, setPinOpen] = useState(false)
  const [pinForm, setPinForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')

  const audienceKey = admin ? `${admin.block_number}|${admin.block_direction}` : ''
  const designVars = designToCssVars(design)

  const setDesignColor = (key, hex) => {
    setDesign((prev) => {
      const next = { ...prev, [key]: hex }
      try {
        localStorage.setItem(DESIGN_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const resetDesign = () => {
    const next = { ...DEFAULT_DESIGN }
    setDesign(next)
    setDesignSection('background')
    try {
      localStorage.setItem(DESIGN_KEY, JSON.stringify(next))
    } catch {}
  }

  const refreshCounts = useCallback(async () => {
    if (!admin) return
    try {
      const keys = blockManagerAudienceKeys(admin)
      const data = await fetchMessageCounts('block_manager', keys)
      setCounts(data.counts || {})
    } catch {
      /* ignore polling errors */
    }
  }, [admin])

  useEffect(() => {
    const session = getSession()
    if (!session || session.type !== 'admin' || session.admin?.role !== 'block_manager') {
      navigate('/', { replace: true })
      return
    }
    setAdmin(session.admin)
    loadData(session.admin, { soft: false })
    // پاک کردن query بعد از اعمال tab/share
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get('tab') || p.get('share')) {
        const url = new URL(window.location.href)
        // share را نگه می‌داریم تا BlockExpenses ببیند
        if (!p.get('share')) {
          url.searchParams.delete('tab')
          window.history.replaceState({}, '', url.pathname + url.search)
        } else {
          url.searchParams.delete('tab')
          window.history.replaceState({}, '', `${url.pathname}?share=1`)
        }
      }
    } catch {
      /* ignore */
    }
  }, [navigate])

  useEffect(() => {
    if (!admin) return
    refreshCounts()
    const t = setInterval(refreshCounts, 12000)
    return () => clearInterval(t)
  }, [admin, refreshCounts])

  const loadData = async (manager, { soft = false } = {}) => {
    if (!soft) setLoading(true)
    if (!soft) setError('')
    try {
      const q = new URLSearchParams({
        block_number: manager.block_number,
        block_direction: manager.block_direction,
      })
      const [reqRes, resRes] = await Promise.all([
        fetch(`/api/membership-requests?${q.toString()}`),
        fetch('/api/residents'),
      ])
      const reqData = await reqRes.json()
      const resData = await resRes.json()
      if (!reqRes.ok) throw new Error(reqData.error || 'خطا در دریافت درخواست‌ها')
      if (!resRes.ok) throw new Error(resData.error || 'خطا در دریافت ساکنین')
      setRequests(Array.isArray(reqData) ? reqData : [])
      const list = Array.isArray(resData) ? resData : []
      setResidents(
        list.filter(
          (r) =>
            r.block_number === manager.block_number &&
            r.block_direction === manager.block_direction,
        ),
      )
    } catch (err) {
      if (!soft) setError(err.message || 'خطا در بارگذاری')
    } finally {
      if (!soft) setLoading(false)
    }
  }

  const openSub = async (sectionId, subId, excel = 'both') => {
    setActiveSection(sectionId)
    setSubTab(subId)
    setExcelMode(excel)
    setOpenMenuId(null)

    // پاک‌سازی فوری شمارنده UI
    const tabKeys = BLOCK_SUB_TAB_KEYS[subId] || []
    if (tabKeys.length) {
      setCounts((prev) => {
        const next = { ...prev }
        for (const k of tabKeys) next[k] = 0
        return next
      })
    }

    if (admin && tabKeys.length) {
      try {
        const keys = blockManagerAudienceKeys(admin)
        await markTabsRead('block_manager', keys, tabKeys)
        await refreshCounts()
      } catch {
        /* ignore */
      }
    }
  }

  const toggleMenu = (id) => {
    // فقط Dropdown شناور باز/بسته می‌شود؛ محتوا تا انتخاب زیرعنوان عوض نمی‌شود
    setOpenMenuId((prev) => (prev === id ? null : id))
  }

  const logout = () => {
    clearSession()
    navigate('/')
  }

  const openChangePassword = () => {
    setPinOpen(true)
    setPinError('')
    setPinSuccess('')
    setPinForm({ current_password: '', new_password: '', confirm_password: '' })
  }

  const submitChangePassword = async (e) => {
    e.preventDefault()
    if (!admin) return
    setPinLoading(true)
    setPinError('')
    setPinSuccess('')
    try {
      const current_password = toEnglishDigits(pinForm.current_password).trim()
      const new_password = toEnglishDigits(pinForm.new_password).trim()
      const confirm_password = toEnglishDigits(pinForm.confirm_password).trim()
      if (new_password.length < 4) throw new Error('رمز جدید حداقل ۴ کاراکتر باشد')
      if (new_password !== confirm_password) throw new Error('رمز جدید و تکرار آن یکسان نیست')

      const res = await fetch('/api/auth-block-manager', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: admin.id,
          block_number: admin.block_number,
          block_direction: admin.block_direction,
          current_password,
          new_password,
          confirm_password,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'تغییر رمز ناموفق بود')

      // session را با داده به‌روز نگه دار
      if (data.admin) {
        const session = getSession()
        if (session?.type === 'admin') {
          saveSession({
            ...session,
            admin: { ...session.admin, ...data.admin, role: 'block_manager' },
          })
          setAdmin((prev) => ({ ...(prev || {}), ...data.admin, role: 'block_manager' }))
        }
      }

      setPinSuccess(data.message || 'رمز با موفقیت تغییر کرد')
      setPinForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      setPinError(err.message || 'خطا در تغییر رمز')
    } finally {
      setPinLoading(false)
    }
  }


  const subBadge = (subId) => {
    // فقط زیرتب‌های مشخص — پیام عمومی/نامشخص شمرده نمی‌شود
    // لیست ساکنین / اکسل / لینک / messages_panel: بدون شمارنده
    if (subId === 'messages_panel' || subId === 'residents_list') return 0
    const keys = BLOCK_SUB_TAB_KEYS[subId]
    if (!keys || keys.length === 0) return 0
    return keys.reduce((s, k) => {
      // tab_key عمومی messages روی تب‌ها نشان داده نشود
      if (k === 'messages') return s
      return s + (Number(counts[k]) || 0)
    }, 0)
  }

  const sectionBadge = (sectionId) => {
    if (sectionId === 'residents_section') {
      // فقط زیرتب‌های واقعی منوی ساکنین
      return (
        subBadge('residents_chat') +
        subBadge('public_chat') +
        subBadge('complex_chat')
      )
    }
    if (sectionId === 'finance_section') {
      return (
        subBadge('bills_create') +
        subBadge('receipts') +
        subBadge('block_expenses') +
        subBadge('finance_status')
      )
    }
    return 0
  }

  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center panel-page" dir="rtl">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const publicUser = {
    unit_name: `مدیر-${admin.block_number}-${admin.block_direction}`,
    first_name: admin.full_name || 'مدیر',
    last_name: 'بلوک',
    block_number: admin.block_number,
    block_direction: admin.block_direction,
  }

  return (
    <div className="min-h-screen relative panel-page user-panel-theme overflow-x-hidden" dir="rtl" style={designVars}>
      <div className="absolute inset-0 transition-all duration-300 user-panel-bg" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-3 sm:px-5 pt-3 sm:pt-8 overflow-x-hidden">
        <div className="app-topbar">
        <div className="user-header-bar">
          <div className="user-header-brand">
            <div className="user-header-avatar flex items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-800">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="panel-title text-sm sm:text-base md:text-lg leading-tight">پنل مدیر بلوک</h1>
              <p className="panel-subtitle text-[10px] sm:text-xs truncate max-w-[10rem] sm:max-w-[16rem]">
                {admin.full_name} — بلوک {admin.block_number} {admin.block_direction}
              </p>
            </div>
          </div>

          <div className="header-action-row">
            <button type="button" onClick={logout} className="header-action-btn is-logout" title="خروج">
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
            <button type="button" onClick={() => setHelpOpen(true)} className="header-action-btn is-help" title="راهنما">
              <CircleHelp className="w-3.5 h-3.5" />
              <span>راهنما</span>
            </button>
            <button type="button" onClick={() => setDesignOpen(true)} className="header-action-btn is-design" title="دیزاین">
              <Palette className="w-3.5 h-3.5" />
              <span>دیزاین</span>
            </button>
            <button type="button" onClick={openChangePassword} className="header-action-btn is-pin" title="تغییر رمز">
              <KeyRound className="w-3.5 h-3.5" />
              <span>رمز</span>
            </button>
          </div>
        </div>
        </div>

        <div className="app-main space-y-4 sm:space-y-5 pt-3 sm:pt-5">
        {/* لینک برنامه / نصب برنامه — مثل پنل کاربر */}
        <div className="panel-tabs panel-tabs-rose">
          <button
            type="button"
            onClick={() => {
              setOpenMenuId(null)
              setActiveSection('utility')
              setSubTab('app_link')
            }}
            className={`panel-tab panel-tab-rose ${subTab === 'app_link' ? 'panel-tab-active' : ''}`}
          >
            <Link2 className="w-4 h-4" />
            <span>لینک برنامه</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpenMenuId(null)
              setActiveSection('utility')
              setSubTab('install_app')
            }}
            className={`panel-tab panel-tab-rose ${subTab === 'install_app' ? 'panel-tab-active' : ''}`}
          >
            <Download className="w-4 h-4" />
            <span>نصب برنامه</span>
          </button>
        </div>

        {error && (
          <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

                                <SlideDropdownMenu
          sections={MAIN_SECTIONS}
          openId={openMenuId}
          activeSubId={subTab}
          onToggle={toggleMenu}
          onSelectSub={(sectionId, subId) => openSub(sectionId, subId)}
          getSectionBadge={(section) => sectionBadge(section.id)}
          getSubBadge={(sub) => subBadge(sub.id)}
        />

        {/* محتوا فقط پس از انتخاب زیرتب */}
        <div className="bm-main-panel">
          {!subTab ? (
            <div className="bm-empty-pick">
              یک عنوان از زیرمجموعه را انتخاب کنید تا عملکرد همان بخش نمایش داده شود.
            </div>
          ) : (
            <>
              {activeSection === 'residents_section' && subTab === 'residents_list' && (
                <ResidentsManager
                  admin={admin}
                  residents={residents}
                  loading={loading}
                  onChanged={() => loadData(admin, { soft: true })}
                />
              )}

              {activeSection === 'residents_section' && subTab === 'residents_chat' && (
                <ManagerPrivateInbox
                  admin={admin}
                  residents={residents}
                  onChanged={refreshCounts}
                />
              )}

              {activeSection === 'residents_section' && subTab === 'public_chat' && (
                <PublicChat user={publicUser} onChanged={refreshCounts} />
              )}

              {activeSection === 'residents_section' && subTab === 'complex_chat' && (
                <StaffChat
                  block_number={admin.block_number}
                  block_direction={admin.block_direction}
                  sender_role="block_manager"
                  sender_name={admin.full_name || 'مدیر بلوک'}
                />
              )}

              {activeSection === 'residents_section' && subTab === 'board_work' && (
                <BoardWorkOrders
                  mode="create"
                  complexName="مجتمع نمونه"
                  block_number={admin.block_number}
                  block_direction={admin.block_direction}
                  actorName={admin.full_name || 'مدیر بلوک'}
                  actorRole="block_manager"
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
                  shareMode={expenseShareMode}
                  onShareConsumed={() => {
                    setExpenseShareMode(false)
                    try {
                      const url = new URL(window.location.href)
                      url.searchParams.delete('share')
                      window.history.replaceState({}, '', url.pathname + url.search)
                    } catch {
                      /* ignore */
                    }
                  }}
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

              {activeSection === 'io_section' &&
                (subTab === 'excel_import' || subTab === 'excel_export') && (
                  <UnitsExcelTools
                    admin={admin}
                    residents={residents}
                    onImported={() => loadData(admin)}
                    mode={subTab === 'excel_import' ? 'import' : 'export'}
                  />
                )}

              {activeSection === 'io_section' && subTab === 'backup_data' && (
                <ManagerBackupRestore admin={admin} mode="backup" />
              )}

              {activeSection === 'io_section' && subTab === 'restore_data' && (
                <ManagerBackupRestore
                  admin={admin}
                  mode="restore"
                  onRestored={() => loadData(admin, { soft: true })}
                />
              )}

              {activeSection === 'io_section' && subTab === 'uploads_browser' && (
                <ManagerUploads admin={admin} scope="block" />
              )}

              {subTab === 'app_link' && <AppLinkTab />}
              {subTab === 'install_app' && <InstallAppTab />}

              </>
          )}
        </div>
        </div>
      </div>

      <AnimatePresence>
        {helpOpen && (
          <Modal onClose={() => setHelpOpen(false)} title="راهنمای مدیر بلوک" subtitle="ساختار تب‌های کرکره‌ای">
            <div className="p-5 space-y-3 text-sm font-semibold text-slate-800 leading-7">
              <HelpItem title="ساکنین">لیست ساکنین، ارتباط خصوصی، چت عمومی، ارتباط با مدیر مجتمع</HelpItem>
              <HelpItem title="امور مالی">
                ثبت قبض، رسید دریافتی، خرج‌کرد بلوک (فاکتور چندردیفه با تاریخ/پیوست). از اپ پرداخت می‌توان تصویر فاکتور را با اشتراک‌گذاری مستقیم به خرج‌کرد پیوست کرد. وضعیت مالی خلاصه صندوق را نشان می‌دهد.
              </HelpItem>
              <HelpItem title="خروجی و ورودی">جدول واحدها، ورود اکسل با شناسایی سرستون و صدور قبض جدید در دیتابیس، خروجی اکسل، پشتیبان‌گیری</HelpItem>
              <HelpItem title="تغییر رمز">از دکمه «رمز» بالای صفحه، رمز ورود مدیر بلوک را تغییر دهید. اعداد فارسی و انگلیسی یکسان‌اند.</HelpItem>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pinOpen && (
          <Modal
            onClose={() => setPinOpen(false)}
            title="تغییر رمز"
            subtitle={`بلوک ${admin.block_number} ${admin.block_direction}`}
          >
            <form onSubmit={submitChangePassword} className="p-5 space-y-3.5">
              {pinError && (
                <div className="flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm font-semibold text-rose-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{pinError}</span>
                </div>
              )}
              {pinSuccess && (
                <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{pinSuccess}</span>
                </div>
              )}
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">رمز فعلی</span>
                <input
                  type="password"
                  className="field-input dir-ltr"
                  value={pinForm.current_password}
                  onChange={(e) =>
                    setPinForm((p) => ({ ...p, current_password: toEnglishDigits(e.target.value) }))
                  }
                  required
                  autoComplete="current-password"
                />
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">
                  رمز جدید (حداقل ۴ کاراکتر — فارسی/انگلیسی یکسان)
                </span>
                <input
                  type="password"
                  className="field-input dir-ltr"
                  value={pinForm.new_password}
                  onChange={(e) =>
                    setPinForm((p) => ({ ...p, new_password: toEnglishDigits(e.target.value) }))
                  }
                  minLength={4}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">تکرار رمز جدید</span>
                <input
                  type="password"
                  className="field-input dir-ltr"
                  value={pinForm.confirm_password}
                  onChange={(e) =>
                    setPinForm((p) => ({ ...p, confirm_password: toEnglishDigits(e.target.value) }))
                  }
                  minLength={4}
                  required
                  autoComplete="new-password"
                />
              </label>
              <button type="submit" disabled={pinLoading} className="btn-primary">
                {pinLoading ? 'در حال ذخیره...' : 'ذخیره رمز جدید'}
              </button>
            </form>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {designOpen && (
          <Modal variant="glass" onClose={() => setDesignOpen(false)} title="دیزاین پنل مدیر بلوک" subtitle="تب‌ها / بک‌لایت / بک‌گراند">
            <div className="p-4 sm:p-5 space-y-3">
              <DesignAccordion
                glass
                title="تب‌ها"
                open={designSection === 'tabs'}
                onToggle={() => setDesignSection((s) => (s === 'tabs' ? '' : 'tabs'))}
                selected={design.tabs}
                colors={DESIGN_COLORS.tabs}
                onPick={(hex) => setDesignColor('tabs', hex)}
              />
              <DesignAccordion
                glass
                title="بک‌لایت"
                open={designSection === 'backlight'}
                onToggle={() => setDesignSection((s) => (s === 'backlight' ? '' : 'backlight'))}
                selected={design.backlight}
                colors={DESIGN_COLORS.backlight}
                onPick={(hex) => setDesignColor('backlight', hex)}
              />
              <DesignAccordion
                glass
                title="بک‌گراند"
                open={designSection === 'background'}
                onToggle={() => setDesignSection((s) => (s === 'background' ? '' : 'background'))}
                selected={design.background}
                colors={DESIGN_COLORS.background}
                onPick={(hex) => setDesignColor('background', hex)}
              />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" onClick={resetDesign} className="w-full rounded-xl py-3 font-bold text-sm border-2 border-slate-300 bg-white/70 text-slate-800 hover:bg-white">
                  برگشت به حالت اولیه
                </button>
                <button type="button" onClick={() => setDesignOpen(false)} className="btn-primary !mt-0">
                  تأیید و بستن
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}


function Modal({ title, subtitle, onClose, children, variant = 'solid' }) {
  const glass = variant === 'glass'
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-x-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className={`absolute inset-0 ${glass ? 'bg-slate-900/25 backdrop-blur-[3px]' : 'bg-slate-900/45 backdrop-blur-[2px]'}`} onClick={onClose} aria-label="بستن" />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.96 }}
        className={`relative w-full max-w-md max-h-[88vh] overflow-y-auto overflow-x-hidden rounded-[1.4rem] shadow-2xl ${
          glass ? 'border border-white/50 bg-white/70 backdrop-blur-xl' : 'border border-slate-200 bg-white'
        }`}
        dir="rtl"
      >
        <div className={`flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sticky top-0 z-10 ${glass ? 'bg-white/70 backdrop-blur-xl border-b border-white/50' : 'bg-slate-50 border-b border-slate-200'}`}>
          <div className="min-w-0">
            <h2 className="font-black text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs font-semibold text-slate-700 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className={`p-2 rounded-xl border shrink-0 ${glass ? 'border-white/50 bg-white/40' : 'border-slate-200 bg-white'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function HelpItem({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
      <p className="font-black text-slate-900 mb-1">{title}</p>
      <p className="text-slate-700">{children}</p>
    </div>
  )
}

function DesignAccordion({ title, open, onToggle, colors, selected, onPick, glass = false }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${glass ? 'border border-white/45 bg-white/30 backdrop-blur-md' : 'border border-slate-200 bg-white'}`}>
      <button type="button" onClick={onToggle} className={`w-full flex items-center justify-between gap-2 px-3.5 py-3 ${glass ? 'bg-white/25 hover:bg-white/40' : 'bg-slate-50 hover:bg-slate-100'}`}>
        <span className="font-black text-slate-900 text-sm">{title}</span>
        <span className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md border border-white/70 shadow-sm" style={{ background: selected }} />
          <span className="text-xs font-bold text-slate-700">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="p-2.5 space-y-2">
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
                {colors.filter((c) => !String(c.id).startsWith('neon-')).map((c) => {
                  const active = selected?.toLowerCase() === c.hex.toLowerCase()
                  const isWhite = c.hex.toLowerCase() === '#ffffff'
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      onClick={() => onPick(c.hex)}
                      className={`shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-[5px] border transition-transform ${active ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-indigo-400' : isWhite ? 'border-slate-400' : 'border-white/80'}`}
                      style={{ background: c.hex }}
                    />
                  )
                })}
              </div>
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
                {colors.filter((c) => String(c.id).startsWith('neon-')).map((c) => {
                  const active = selected?.toLowerCase() === c.hex.toLowerCase()
                  return (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      onClick={() => onPick(c.hex)}
                      className={`shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-[5px] border transition-transform ${active ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-white' : 'border-black/20'}`}
                      style={{ background: c.hex, boxShadow: active ? `0 0 10px ${c.hex}` : `0 0 6px ${c.hex}88` }}
                    />
                  )
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
