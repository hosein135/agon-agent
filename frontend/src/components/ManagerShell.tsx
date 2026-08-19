import { useState, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import {
  LogOut,
  CircleHelp,
  Palette,
  KeyRound,
  Link2,
  Download,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import type { HelpItemData, PasswordApi } from '../types'
import { toEnglishDigits } from '../lib/digits'
import {
  DESIGN_COLORS,
  DEFAULT_DESIGN,
  designToCssVars,
  loadDesign,
  saveDesign,
} from '../lib/managerDesign'
import { Modal, HelpItem, DesignAccordion } from './ManagerUiBits'
import AppLinkTab from './AppLinkTab'
import InstallAppTab from './InstallAppTab'

/**
 * پوسته مشترک مدیر بلوک/مجتمع/سیستم:
 * تغییر رمز، راهنما، دیزاین، خروج، لینک دعوت، نصب برنامه
 */
export default function ManagerShell({
  title,
  subtitle,
  icon: Icon,
  designKey,
  helpTitle = 'راهنما',
  helpItems = [],
  onLogout,
  passwordApi,
  children,
  topExtra = null,
}: {
  title: string
  subtitle?: string
  icon: LucideIcon
  designKey: string
  helpTitle?: string
  helpItems?: HelpItemData[]
  onLogout: () => void
  passwordApi: PasswordApi
  children?: ReactNode
  topExtra?: ReactNode
}) {
  const [design, setDesign] = useState(() => loadDesign(designKey))
  const [designOpen, setDesignOpen] = useState(false)
  const [designSection, setDesignSection] = useState('background')
  const [helpOpen, setHelpOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [utility, setUtility] = useState('') // app_link | install_app | ''
  const [pinForm, setPinForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [pinLoading, setPinLoading] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState('')

  const designVars = designToCssVars(design)

  const setDesignColor = (key, hex) => {
    setDesign((prev) => {
      const next = { ...prev, [key]: hex }
      saveDesign(designKey, next)
      return next
    })
  }

  const resetDesign = () => {
    const next = { ...DEFAULT_DESIGN }
    setDesign(next)
    setDesignSection('background')
    saveDesign(designKey, next)
  }

  const submitPassword = async (e) => {
    e.preventDefault()
    if (!passwordApi?.url) {
      setPinError('تغییر رمز برای این نقش هنوز فعال نیست')
      return
    }
    setPinLoading(true)
    setPinError('')
    setPinSuccess('')
    try {
      const current_password = toEnglishDigits(pinForm.current_password).trim()
      const new_password = toEnglishDigits(pinForm.new_password).trim()
      const confirm_password = toEnglishDigits(pinForm.confirm_password).trim()
      if (new_password.length < 4) throw new Error('رمز جدید حداقل ۴ کاراکتر باشد')
      if (new_password !== confirm_password) throw new Error('رمز جدید و تکرار آن یکسان نیست')
      const body = passwordApi.bodyFromForm({
        current_password,
        new_password,
        confirm_password,
      })
      const res = await fetch(passwordApi.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'تغییر رمز ناموفق بود')
      setPinSuccess(data.message || 'رمز با موفقیت تغییر کرد')
      setPinForm({ current_password: '', new_password: '', confirm_password: '' })
      passwordApi.onSuccess?.(data)
    } catch (err) {
      setPinError(err.message || 'خطا در تغییر رمز')
    } finally {
      setPinLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen relative panel-page user-panel-theme overflow-x-hidden"
      dir="rtl"
      style={designVars}
    >
      <div className="absolute inset-0 transition-all duration-300 user-panel-bg" />

      <div className="relative z-10 w-full max-w-5xl mx-auto px-3 sm:px-5 pt-3 sm:pt-8 overflow-x-hidden">
        <div className="app-topbar">
        <div className="user-header-bar">
          <div className="user-header-brand">
            <div className="user-header-avatar flex items-center justify-center bg-gradient-to-br from-indigo-500 to-indigo-800">
              {Icon ? <Icon className="w-5 h-5 text-white" /> : null}
            </div>
            <div className="min-w-0">
              <h1 className="panel-title text-sm sm:text-base md:text-lg leading-tight">{title}</h1>
              <p className="panel-subtitle text-[10px] sm:text-xs truncate max-w-[12rem] sm:max-w-[18rem]">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="header-action-row">
            <button type="button" onClick={onLogout} className="header-action-btn is-logout" title="خروج">
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
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
              title="دیزاین"
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
                setPinForm({ current_password: '', new_password: '', confirm_password: '' })
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

        <div className="app-main space-y-4 sm:space-y-5 pt-3 sm:pt-5">
        <div className="panel-tabs panel-tabs-rose">
          <button
            type="button"
            onClick={() => setUtility((u) => (u === 'app_link' ? '' : 'app_link'))}
            className={`panel-tab panel-tab-rose ${utility === 'app_link' ? 'panel-tab-active' : ''}`}
          >
            <Link2 className="w-4 h-4" />
            <span>لینک برنامه</span>
          </button>
          <button
            type="button"
            onClick={() => setUtility((u) => (u === 'install_app' ? '' : 'install_app'))}
            className={`panel-tab panel-tab-rose ${utility === 'install_app' ? 'panel-tab-active' : ''}`}
          >
            <Download className="w-4 h-4" />
            <span>نصب برنامه</span>
          </button>
        </div>

        {utility === 'app_link' && <AppLinkTab />}
        {utility === 'install_app' && <InstallAppTab />}

        {topExtra}
        {children}
        </div>
      </div>

      <AnimatePresence>
        {helpOpen && (
          <Modal onClose={() => setHelpOpen(false)} title={helpTitle} subtitle="سلسله‌مراتب و امکانات">
            <div className="p-5 space-y-3 text-sm font-semibold text-slate-800 leading-7">
              {helpItems.map((h) => (
                <HelpItem key={h.title} title={h.title}>
                  {h.body}
                </HelpItem>
              ))}
              <HelpItem title="تغییر رمز">از دکمه «رمز» رمز ورود را عوض کنید. اعداد فارسی و انگلیسی یکسان‌اند.</HelpItem>
              <HelpItem title="دیزاین / لینک / نصب">مشابه پنل مدیر بلوک — رنگ‌ها، لینک دعوت و نصب PWA.</HelpItem>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pinOpen && (
          <Modal onClose={() => setPinOpen(false)} title="تغییر رمز" subtitle="رمز ورود پنل">
            <form onSubmit={submitPassword} className="p-5 space-y-3.5">
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
              {['current_password', 'new_password', 'confirm_password'].map((key) => (
                <label key={key} className="block">
                  <span className="field-label text-xs mb-1.5 block">
                    {key === 'current_password'
                      ? 'رمز فعلی'
                      : key === 'new_password'
                        ? 'رمز جدید (حداقل ۴ کاراکتر)'
                        : 'تکرار رمز جدید'}
                  </span>
                  <input
                    type="password"
                    className="field-input dir-ltr"
                    value={pinForm[key]}
                    onChange={(e) =>
                      setPinForm((p) => ({ ...p, [key]: toEnglishDigits(e.target.value) }))
                    }
                    required
                    minLength={key === 'current_password' ? 1 : 4}
                  />
                </label>
              ))}
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
            title="دیزاین پنل"
            subtitle="تب‌ها / بک‌لایت / بک‌گراند"
          >
            <div className="p-4 sm:p-5 space-y-3">
              {['tabs', 'backlight', 'background'].map((sec) => (
                <DesignAccordion
                  key={sec}
                  glass
                  title={sec === 'tabs' ? 'تب‌ها' : sec === 'backlight' ? 'بک‌لایت' : 'بک‌گراند'}
                  open={designSection === sec}
                  onToggle={() => setDesignSection((s) => (s === sec ? '' : sec))}
                  selected={design[sec]}
                  colors={DESIGN_COLORS[sec]}
                  onPick={(hex) => setDesignColor(sec, hex)}
                />
              ))}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetDesign}
                  className="w-full rounded-xl py-3 font-bold text-sm border-2 border-slate-300 bg-white/70 text-slate-800 hover:bg-white"
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
