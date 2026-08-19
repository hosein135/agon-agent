import { motion, AnimatePresence } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  variant = 'solid',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children?: ReactNode
  variant?: 'solid' | 'glass'
}) {
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
          glass ? 'border border-white/50 bg-white/70 backdrop-blur-xl' : 'border border-slate-200 bg-white'
        }`}
        dir="rtl"
      >
        <div
          className={`flex items-center justify-between gap-2 px-4 sm:px-5 py-3.5 sticky top-0 z-10 ${
            glass ? 'bg-white/70 backdrop-blur-xl border-b border-white/50' : 'bg-slate-50 border-b border-slate-200'
          }`}
        >
          <div className="min-w-0">
            <h2 className="font-black text-slate-900">{title}</h2>
            {subtitle && <p className="text-xs font-semibold text-slate-700 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl border shrink-0 ${glass ? 'border-white/50 bg-white/40' : 'border-slate-200 bg-white'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

export function HelpItem({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
      <p className="font-black text-slate-900 mb-1">{title}</p>
      <p className="text-slate-700">{children}</p>
    </div>
  )
}

export function DesignAccordion({
  title,
  open,
  onToggle,
  colors,
  selected,
  onPick,
  glass = false,
}: {
  title: string
  open: boolean
  onToggle: () => void
  colors: Array<{ id: string; hex: string; label: string }>
  selected?: string
  onPick: (hex: string) => void
  glass?: boolean
}) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${
        glass ? 'border border-white/45 bg-white/30 backdrop-blur-md' : 'border border-slate-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-3 ${
          glass ? 'bg-white/25 hover:bg-white/40' : 'bg-slate-50 hover:bg-slate-100'
        }`}
      >
        <span className="font-black text-slate-900 text-sm">{title}</span>
        <span className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md border border-white/70 shadow-sm" style={{ background: selected }} />
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
                              ? 'border-slate-400'
                              : 'border-white/80'
                        }`}
                        style={{ background: c.hex }}
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
                          active ? 'border-slate-900 scale-110 ring-2 ring-offset-1 ring-white' : 'border-black/20'
                        }`}
                        style={{
                          background: c.hex,
                          boxShadow: active ? `0 0 10px ${c.hex}` : `0 0 6px ${c.hex}88`,
                        }}
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

export function BreadcrumbBar({
  items = [],
  onHome,
}: {
  items?: Array<{ label: string; onClick?: () => void }>
  onHome?: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-600 bg-white/80 border border-slate-200 rounded-2xl px-3 py-2">
      {onHome && (
        <button type="button" onClick={onHome} className="text-indigo-700 hover:underline">
          خانه
        </button>
      )}
      {items.map((it, idx) => (
        <span key={`${it.label}-${idx}`} className="inline-flex items-center gap-1.5">
          {(onHome || idx > 0) && <span className="text-slate-300">/</span>}
          {it.onClick ? (
            <button type="button" onClick={it.onClick} className="text-slate-700 hover:underline">
              {it.label}
            </button>
          ) : (
            <span className="text-slate-900">{it.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}

export function EntityCard({
  title,
  subtitle,
  meta,
  icon: Icon,
  onClick,
  badge,
}: {
  title: string
  subtitle?: string
  meta?: string
  icon?: LucideIcon
  onClick?: () => void
  badge?: string | number | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-right rounded-2xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-lg hover:shadow-slate-900/5 transition-all px-4 py-3.5"
    >
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-800 flex items-center justify-center border border-indigo-200 shrink-0">
          {Icon ? <Icon className="w-5 h-5 text-white" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-black text-slate-900 truncate">{title}</p>
            {badge != null && badge !== '' && (
              <span className="text-[11px] font-black text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 shrink-0">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs font-bold text-indigo-800 mt-0.5 truncate">{subtitle}</p>}
          {meta && <p className="text-[11px] font-semibold text-slate-600 mt-1">{meta}</p>}
          <p className="text-[11px] font-black text-indigo-700 mt-2">لمس برای ورود به لایه زیرین ←</p>
        </div>
      </div>
    </button>
  )
}
