'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from '../lib/nav'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Building2,
  LogOut,
  Home,
  Layers,
  BadgeCheck,
  Phone,
  User,
  Receipt,
  PieChart,
  MessageSquare,
  MessagesSquare,
  X,
  Link2,
  Download,
  Landmark,
  KeyRound,
  CircleHelp,
  AlertCircle,
  CheckCircle2,
  Palette,
  Users,
} from 'lucide-react'
import { clearSession, getSession } from '../lib/session'
import {
  fetchMessageCounts,
  markTabsRead,
  sumTabCounts,
  RESIDENT_TAB_KEYS,
} from '../lib/messages'
import { toEnglishDigits } from '../lib/digits'
import TabBadge from '../components/TabBadge'
import ResidentBills from '../components/ResidentBills'
import ResidentFinance from '../components/ResidentFinance'
import PrivateChat from '../components/PrivateChat'
import PublicChat from '../components/PublicChat'
import AppLinkTab from '../components/AppLinkTab'
import InstallAppTab from '../components/InstallAppTab'
import BlockFinanceTab from '../components/BlockFinanceTab'

const TABS = [
  { id: 'bills', label: 'رسید', icon: Receipt },
  { id: 'finance', label: 'گزارش مالی', icon: PieChart },
  { id: 'manager_chat', label: 'ارتباط با مدیر', icon: MessageSquare },
  { id: 'public_chat', label: 'چت عمومی', icon: MessagesSquare },
]

const EXTRA_TABS = [
  { id: 'app_link', label: 'لینک برنامه', icon: Link2 },
  { id: 'install_app', label: 'نصب برنامه', icon: Download },
  { id: 'block_finance', label: 'مالی بلوک', icon: Landmark },
]

const DESIGN_KEY = 'block7_user_design_v4'

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
  const { r, g, b } = hexToRgb(bg)
  const lr = hexToRgb(light)
  // قاب سبز مثل صفحه ورود؛ بک‌لایت فقط برای هاله نور
  const borderColor = 'rgba(24, 24, 27, 0.08)'
  return {
    '--up-bg': `radial-gradient(1200px 620px at 100% -8%, ${mixHex(tab, 0.82)} 0%, transparent 52%), radial-gradient(900px 520px at 0% 110%, ${mixHex(light, 0.78)} 0%, transparent 58%), linear-gradient(180deg, ${mixHex(bg, 0.92)} 0%, ${mixHex(bg, 0.55)} 100%)`,
    '--up-bg-rgb': `${r}, ${g}, ${b}`,
    '--up-tab': tab,
    '--up-tab-soft': mixHex(tab, 0.9),
    '--up-tab-mid': mixHex(tab, 0.7),
    '--up-tab-strong': darkenHex(tab, 0.18),
    '--up-tab-text': '#3f3f46',
    '--up-tab-active': `linear-gradient(180deg, ${mixHex(tab, 0.12)} 0%, ${tab} 48%, ${darkenHex(tab, 0.18)} 100%)`,
    '--up-glow': light,
    '--up-glow-rgb': `${lr.r}, ${lr.g}, ${lr.b}`,
    '--up-glow-soft': `rgba(${lr.r}, ${lr.g}, ${lr.b}, 0.18)`,
    '--up-border': borderColor,
  } as CSSProperties
}

export default function UserPanel() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [tab, setTab] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      return p.get('tab') || 'bills'
    } catch {
      return 'bills'
    }
  })
  const [shareMode, setShareMode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('share') === '1'
    } catch {
      return false
    }
  })
  const [counts, setCounts] = useState({})
  const [profileOpen, setProfileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [designOpen, setDesignOpen] = useState(false)
  const [design, setDesign] = useState(() => loadDesign())
  const [designSection, setDesignSection] = useState('background') // tabs | backlight | background
  const [pinForm, setPinForm] = useState({ current_pin: '', new_pin: '', confirm_pin: '' })
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')

  const designVars = designToCssVars(design)

  // پاک کردن query بعد از اعمال tab/share تا رفرش بعدی گیر نکند
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      if (p.get('tab') || p.get('share')) {
        const url = new URL(window.location.href)
        url.searchParams.delete('tab')
        // share را نگه می‌داریم تا ResidentBills ببیند؛ بعد از consume پاک می‌شود
        window.history.replaceState({}, '', url.pathname + (url.searchParams.get('share') ? '?share=1' : '') + url.hash)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const setDesignColor = (key, hex) => {
    setDesign((prev) => {
      const next = { ...prev, [key]: hex }
      try {
        localStorage.setItem(DESIGN_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const resetDesign = () => {
    const next = { ...DEFAULT_DESIGN }
    setDesign(next)
    setDesignSection('background')
    try {
      localStorage.setItem(DESIGN_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const refreshCounts = useCallback(async () => {
    if (!user?.unit_name) return
    try {
      const keys = [user.unit_name, 'all']
      if (user?.id != null) keys.push(`resident:${user.id}`)
      if (user?.occupancy) keys.push(`${user.unit_name}|${user.occupancy}`)
      const data = await fetchMessageCounts('resident', keys)
      setCounts(data.counts || {})
    } catch {
      /* ignore */
    }
  }, [user?.unit_name])

  useEffect(() => {
    const session = getSession()
    if (!session || session.type !== 'resident') {
      navigate('/', { replace: true })
      return
    }
    setUser(session.user)
  }, [navigate])

  useEffect(() => {
    if (!user?.unit_name) return
    refreshCounts()
    const t = setInterval(refreshCounts, 12000)
    return () => clearInterval(t)
  }, [user?.unit_name, refreshCounts])

  const openTab = async (id) => {
    setTab(id)
    const tabKeys = RESIDENT_TAB_KEYS[id] || []
    if (tabKeys.length) {
      setCounts((prev) => {
        const next = { ...prev }
        for (const k of tabKeys) next[k] = 0
        return next
      })
    }
    if (user?.unit_name && tabKeys.length) {
      try {
        const keys = [user.unit_name, 'all']
        if (user?.id != null) keys.push(`resident:${user.id}`)
        if (user?.occupancy) keys.push(`${user.unit_name}|${user.occupancy}`)
        await markTabsRead('resident', keys, tabKeys)
        await refreshCounts()
      } catch {
        /* ignore */
      }
    }
  }

  const logout = () => {
    clearSession()
    navigate('/')
  }

  const submitChangePin = async (e) => {
    e.preventDefault()
    setPinError('')
    setPinSuccess('')
    const currentPin = toEnglishDigits(pinForm.current_pin).trim()
    const newPin = toEnglishDigits(pinForm.new_pin).trim()
    const confirmPin = toEnglishDigits(pinForm.confirm_pin).trim()
    if (newPin.length < 4) {
      setPinError('رمز جدید باید حداقل ۴ کاراکتر باشد')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('رمز جدید و تکرار آن یکسان نیست')
      return
    }
    setPinLoading(true)
    try {
      const res = await fetch('/api/resident-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change',
          unit_name: user.unit_name,
          current_pin: currentPin,
          new_pin: newPin,
          confirm_pin: confirmPin,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تغییر رمز ناموفق بود')
      setPinSuccess(data.message || 'رمز با موفقیت تغییر کرد')
      setPinForm({ current_pin: '', new_pin: '', confirm_pin: '' })
    } catch (err) {
      setPinError(err.message || 'خطا در تغییر رمز')
    } finally {
      setPinLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center panel-page" dir="rtl">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const details = [
    { icon: User, label: 'نام', value: user.first_name },
    { icon: User, label: 'نام خانوادگی', value: user.last_name },
    { icon: Home, label: 'نام واحد', value: user.unit_name },
    { icon: Building2, label: 'شماره بلوک', value: user.block_number },
    { icon: Building2, label: 'جهت بلوک', value: user.block_direction },
    { icon: Layers, label: 'طبقه', value: user.floor },
    { icon: BadgeCheck, label: 'مالک / مستاجر', value: user.occupancy },
    {
      icon: Users,
      label: 'تعداد نفرات واحد',
      value:
        user.people_count != null
          ? `${Number(user.people_count).toLocaleString('fa-IR')} نفر`
          : '—',
    },
    { icon: Phone, label: 'شماره تماس', value: user.phone },
  ]

  return (
    <div className="min-h-screen relative panel-page user-panel-theme overflow-x-hidden" dir="rtl" style={designVars}>
      <div className="absolute inset-0 transition-all duration-300 user-panel-bg" />
      <div className="relative z-10 w-full max-w-4xl mx-auto px-3 sm:px-5 pt-3 sm:pt-8 overflow-x-hidden">
        <div className="app-topbar">
        <div className="user-header-bar">
          {/* بالا-چپ (در RTL = انتهای ردیف): پنل کاربر */}
          <div className="user-header-brand">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="user-header-avatar"
              title="مشاهده مشخصات"
              aria-label="مشاهده مشخصات واحد"
            >
              <img src="/app-logo.jpg" alt="لوگو" className="w-full h-full object-cover" width={40} height={40} />
            </button>
            <div className="min-w-0">
              <h1 className="panel-title text-sm sm:text-base md:text-lg leading-tight">پنل کاربر</h1>
              <p className="panel-subtitle text-[10px] sm:text-xs truncate max-w-[8.5rem] sm:max-w-[12rem]">
                واحد {user.unit_name} — {user.last_name}
              </p>
            </div>
          </div>

          {/* بالا-راست (در RTL = ابتدای ردیف): تب‌های کوچک با نوشته */}
          <div className="header-action-row">
            <button type="button" onClick={logout} className="header-action-btn is-logout" title="خروج">
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setHelpOpen(true)
                setPinError('')
                setPinSuccess('')
              }}
              className="header-action-btn is-help"
              title="راهنما"
            >
              <CircleHelp className="w-3.5 h-3.5" />
              <span>راهنما</span>
            </button>
            <button
              type="button"
              onClick={() => setDesignOpen(true)}
              className="header-action-btn is-design"
              title="دیزاین صفحه"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>دیزاین</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPinOpen(true)
                setPinError('')
                setPinSuccess('')
                setPinForm({ current_pin: '', new_pin: '', confirm_pin: '' })
              }}
              className="header-action-btn is-pin"
              title="تغییر رمز"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>رمز</span>
            </button>
          </div>
        </div>
        </div>

        <div className="app-main has-bottom-nav space-y-4 sm:space-y-5 pt-3 sm:pt-5">
        <div className="panel-tabs panel-tabs-rose">
          {EXTRA_TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openTab(t.id)}
                className={`panel-tab panel-tab-rose ${tab === t.id ? 'panel-tab-active' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        <div className="panel-tabs user-main-tabs">
          {TABS.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openTab(t.id)}
                className={`panel-tab user-main-tab ${tab === t.id ? 'panel-tab-active' : ''}`}
              >
                <Icon className="user-main-tab-icon" />
                <span className="user-main-tab-label">{t.label}</span>
                <TabBadge
                  count={sumTabCounts(counts, RESIDENT_TAB_KEYS[t.id] || [t.id])}
                  title={`جدید در ${t.label}`}
                />
              </button>
            )
          })}
        </div>

        {tab === 'bills' && (
          <ResidentBills
            user={user}
            onChanged={refreshCounts}
            shareMode={shareMode}
            onShareConsumed={() => {
              setShareMode(false)
              try {
                const url = new URL(window.location.href)
                url.searchParams.delete('share')
                window.history.replaceState({}, '', url.pathname + url.search + url.hash)
              } catch {
                /* ignore */
              }
            }}
          />
        )}
        {tab === 'finance' && <ResidentFinance user={user} />}
        {tab === 'manager_chat' && (
          <PrivateChat
            unit_name={user.unit_name}
            block_number={user.block_number}
            block_direction={user.block_direction}
            sender_type="resident"
            sender_name={`${user.first_name} ${user.last_name}`}
            title="ارتباط با مدیر"
            onChanged={refreshCounts}
          />
        )}
        {tab === 'public_chat' && <PublicChat user={user} onChanged={refreshCounts} />}
        {tab === 'app_link' && <AppLinkTab />}
        {tab === 'install_app' && <InstallAppTab />}
        {tab === 'block_finance' && <BlockFinanceTab user={user} />}
        </div>

        <nav className="app-bottom-nav" aria-label="منوی اصلی">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={`nav-${t.id}`}
                type="button"
                onClick={() => openTab(t.id)}
                className={`app-bottom-item ${active ? 'is-active' : ''}`}
              >
                <Icon className="w-5 h-5" />
                <span>{t.label}</span>
                <TabBadge
                  count={sumTabCounts(counts, RESIDENT_TAB_KEYS[t.id] || [t.id])}
                  title={`جدید در ${t.label}`}
                />
              </button>
            )
          })}
        </nav>
      </div>

      <AnimatePresence>
        {profileOpen && (
          <Modal onClose={() => setProfileOpen(false)} title="مشخصات واحد" subtitle={`واحد ${user.unit_name} — ${user.last_name}`}>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {details.map((d) => {
                const Icon = d.icon
                return (
                  <div key={d.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1">
                      <Icon className="w-3.5 h-3.5 text-indigo-600" />
                      {d.label}
                    </div>
                    <p className="font-extrabold text-slate-900 text-sm break-all">{d.value || '—'}</p>
                  </div>
                )
              })}
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {helpOpen && (
          <Modal onClose={() => setHelpOpen(false)} title="راهنمای پنل کاربر" subtitle="آموزش سریع امکانات">
            <div className="p-5 space-y-3 text-sm font-semibold text-slate-800 leading-7">
              <HelpItem title="رسید">
                تصویر رسید را پیوست و ارسال کنید. از اپ‌های پرداخت هم می‌توانید با «اشتراک‌گذاری» رسید را مستقیم به این بخش بفرستید، قبض را انتخاب کنید و برای مدیر ارسال شود.
              </HelpItem>
              <HelpItem title="گزارش مالی">
                جدول مالی واحد به‌همراه دکمه «خروجی اکسل» با ستون‌های واحد، نام، نام خانوادگی، عنوان قبض، تاریخ دریافت، تاریخ تایید مدیر و وضعیت.
              </HelpItem>
              <HelpItem title="ارتباط با مدیر">
                گفتگوی خصوصی فقط بین شما و مدیر است و سایر ساکنین آن را نمی‌بینند.
              </HelpItem>
              <HelpItem title="چت عمومی">
                پیام متنی/صوتی برای همه ساکنین. فقط پیام‌های خودتان قابل ویرایش و حذف است.
              </HelpItem>
              <HelpItem title="لینک برنامه / نصب برنامه">
                لینک ورود را کپی کنید و برنامه را روی موبایل یا رایانه نصب کنید.
              </HelpItem>
              <HelpItem title="مالی بلوک">
                وضعیت مالی همه واحدهای بلوک برای شفاف‌سازی عمومی نمایش داده می‌شود.
              </HelpItem>
              <HelpItem title="تغییر رمز">
                از دکمه «تغییر رمز» کنار خروج استفاده کنید. رمز حداقل ۴ کاراکتر است. اعداد فارسی و انگلیسی یکسان‌اند (۱۲۳۴ = 1234).
              </HelpItem>
              <HelpItem title="فراموشی رمز">
                در صفحه اول، تب ورود ساکنین → گزینه «فراموشی رمز» را بزنید و با اطلاعات هویتی رمز جدید بسازید.
              </HelpItem>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pinOpen && (
          <Modal onClose={() => setPinOpen(false)} title="تغییر رمز" subtitle={`واحد ${user.unit_name}`}>
            <form onSubmit={submitChangePin} className="p-5 space-y-3.5">
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
                  value={pinForm.current_pin}
                  onChange={(e) => setPinForm((p) => ({ ...p, current_pin: toEnglishDigits(e.target.value) }))}
                  required
                />
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">رمز جدید (حداقل ۴ کاراکتر — فارسی/انگلیسی یکسان)</span>
                <input
                  type="password"
                  className="field-input dir-ltr"
                  value={pinForm.new_pin}
                  onChange={(e) => setPinForm((p) => ({ ...p, new_pin: toEnglishDigits(e.target.value) }))}
                  minLength={4}
                  required
                />
              </label>
              <label className="block">
                <span className="field-label text-xs mb-1.5 block">تکرار رمز جدید</span>
                <input
                  type="password"
                  className="field-input dir-ltr"
                  value={pinForm.confirm_pin}
                  onChange={(e) => setPinForm((p) => ({ ...p, confirm_pin: toEnglishDigits(e.target.value) }))}
                  minLength={4}
                  required
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
          <Modal
            variant="glass"
            onClose={() => setDesignOpen(false)}
            title="دیزاین صفحه"
            subtitle="رنگ تب‌ها، بک‌لایت و بک‌گراند"
          >
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-sm font-semibold text-slate-800/90">
                هر بخش را باز کنید و یکی از ۸ رنگ را انتخاب کنید. تغییر بلافاصله روی پس‌زمینه دیده می‌شود.
              </p>

              <div
                className="rounded-2xl border border-white/40 overflow-hidden backdrop-blur-md"
                style={{
                  background: designVars['--up-bg'],
                  boxShadow: `0 0 18px ${designVars['--up-glow-soft']}`,
                }}
              >
                <div className="px-3 py-2 text-[11px] font-black text-slate-900/90 bg-white/35 backdrop-blur-md border-b border-white/30">
                  پیش‌نمایش زنده
                </div>
                <div className="p-3 flex gap-2">
                  {['تب ۱', 'تب ۲', 'تب ۳'].map((label, i) => (
                    <div
                      key={label}
                      className="flex-1 rounded-lg text-center text-[10px] font-extrabold py-2 border"
                      style={
                        i === 0
                          ? {
                              background: designVars['--up-tab-active'],
                              color: '#fff',
                              borderColor: design.backlight,
                              boxShadow: `0 0 12px ${designVars['--up-glow-soft']}`,
                            }
                          : {
                              background: designVars['--up-tab-soft'],
                              color: designVars['--up-tab-text'],
                              borderColor: design.backlight,
                              boxShadow: `0 0 10px ${designVars['--up-glow-soft']}`,
                            }
                      }
                    >
                      {label}
                    </div>
                  ))}
                </div>
              </div>

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
                <button
                  type="button"
                  onClick={resetDesign}
                  className="w-full rounded-xl py-3 font-bold text-sm border-2 border-slate-300 bg-white/70 text-slate-800 hover:bg-white transition-all"
                >
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
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 overflow-x-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button
        type="button"
        className={`absolute inset-0 ${glass ? 'bg-slate-900/25 backdrop-blur-[3px]' : 'bg-slate-900/45 backdrop-blur-[2px]'}`}
        onClick={onClose}
        aria-label="بستن"
      />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.96 }}
        className={`relative w-full max-w-md max-h-[88vh] overflow-y-auto overflow-x-hidden rounded-[1.4rem] shadow-2xl ${
          glass
            ? 'border border-white/50 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/55'
            : 'border border-slate-200 bg-white'
        }`}
        dir="rtl"
      >
        <div
          className={`flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sticky top-0 z-10 ${
            glass
              ? 'bg-white/70 backdrop-blur-xl border-b border-white/50'
              : 'bg-slate-50 border-b border-slate-200'
          }`}
        >
          <div className="min-w-0">
            <h2 className="font-black text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs font-semibold text-slate-700 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border shrink-0 ${
              glass
                ? 'border-white/50 bg-white/40 text-slate-900 hover:bg-white/60'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
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
    <div
      className={`rounded-2xl overflow-hidden ${
        glass
          ? 'border border-white/45 bg-white/30 backdrop-blur-md'
          : 'border border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-3 transition-colors ${
          glass ? 'bg-white/25 hover:bg-white/40' : 'bg-slate-50 hover:bg-slate-100'
        }`}
      >
        <span className="font-black text-slate-900 text-sm">{title}</span>
        <span className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-md border border-white/70 shadow-sm"
            style={{ background: selected }}
            title={selected}
          />
          <span className="text-xs font-bold text-slate-700">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2.5 space-y-2">
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
                {colors
                  .filter((c) => !String(c.id).startsWith('neon-'))
                  .map((c) => {
                    const active = selected?.toLowerCase() === c.hex.toLowerCase()
                    const isWhite = c.hex.toLowerCase() === '#ffffff'
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={c.label}
                        onClick={() => onPick(c.hex)}
                        className={`shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-[5px] border transition-transform ${
                          active
                            ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-indigo-400'
                            : isWhite
                              ? 'border-slate-400 shadow-sm hover:scale-105'
                              : 'border-white/80 shadow-sm hover:scale-105'
                        }`}
                        style={{ background: c.hex }}
                        aria-label={c.label}
                      />
                    )
                  })}
              </div>
              <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
                {colors
                  .filter((c) => String(c.id).startsWith('neon-'))
                  .map((c) => {
                    const active = selected?.toLowerCase() === c.hex.toLowerCase()
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={c.label}
                        onClick={() => onPick(c.hex)}
                        className={`shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-[5px] border transition-transform ${
                          active
                            ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-white'
                            : 'border-black/20 shadow-sm hover:scale-105'
                        }`}
                        style={{
                          background: c.hex,
                          boxShadow: active ? `0 0 10px ${c.hex}` : `0 0 6px ${c.hex}88`,
                        }}
                        aria-label={c.label}
                      />
                    )
                  })}
              </div>
              <p className="text-[10px] font-bold text-slate-600">ردیف پایین: رنگ‌های نئون</p>
            </div>
            <p className="px-3 pb-3 text-[11px] font-bold text-slate-700">
              رنگ انتخابی: <span className="text-slate-900">{selected}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
