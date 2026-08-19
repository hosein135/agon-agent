import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import TabBadge from './TabBadge'
import type { MenuSection } from '../types'

/**
 * Floating dropdown/popover under each main tab.
 * - Does NOT expand page layout (position: fixed overlay)
 * - Width ~250–350px, sized to content
 * - Only one open at a time
 * - Outside click / Esc closes
 */
export default function SlideDropdownMenu({
  sections = [],
  openId = null,
  activeSubId = '',
  onToggle,
  onSelectSub,
  getSectionBadge,
  getSubBadge,
}: {
  sections?: MenuSection[]
  openId?: string | null
  activeSubId?: string
  onToggle: (id: string | null) => void
  onSelectSub: (sectionId: string, subId: string) => void
  getSectionBadge?: (section: MenuSection) => number | string | null | undefined
  getSubBadge?: (sub: { id: string }) => number | string | null | undefined
}) {
  const rootRef = useRef(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const panelRef = useRef(null)
  const [coords, setCoords] = useState({
    top: 0,
    left: 0,
    width: 300,
    openUp: false,
    btnTop: 0,
    btnBottom: 0,
  })

  const openSection = sections.find((s) => s.id === openId) || null
  const openIndex = Math.max(0, sections.findIndex((s) => s.id === openId))

  const updatePosition = () => {
    if (!openId) return
    const btn = btnRefs.current[openId]
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const preferred = Math.min(340, Math.max(250, rect.width + 48))
    const width = Math.min(preferred, vw - 16)

    // align to button (RTL-aware: keep under tab, clamp to viewport)
    let left = rect.left + rect.width / 2 - width / 2
    left = Math.max(8, Math.min(left, vw - width - 8))

    const spaceBelow = vh - rect.bottom
    const estimatedPanelH = Math.min(360, 56 + (openSection?.subs?.length || 3) * 48)
    const openUp = spaceBelow < estimatedPanelH + 12 && rect.top > spaceBelow
    const top = openUp ? Math.max(8, rect.top - 8) : rect.bottom + 8

    setCoords({ top, left, width, openUp, btnBottom: rect.bottom, btnTop: rect.top })
  }

  useLayoutEffect(() => {
    updatePosition()
  }, [openId, openSection?.subs?.length])

  useEffect(() => {
    if (!openId) return
    const onWin = () => updatePosition()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [openId, openSection?.subs?.length])

  useEffect(() => {
    if (!openId) return
    const onDoc = (e) => {
      const t = e.target
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      onToggle?.(null)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onToggle?.(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc, { passive: true })
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [openId, onToggle])

  const panelStyle = coords.openUp
    ? {
        position: 'fixed',
        left: coords.left,
        width: coords.width,
        bottom: Math.max(8, window.innerHeight - (coords.btnTop || coords.top) + 0),
        top: 'auto',
        zIndex: 80,
      }
    : {
        position: 'fixed',
        left: coords.left,
        width: coords.width,
        top: coords.top,
        zIndex: 80,
      }

  // fix openUp bottom calc using btnTop
  if (coords.openUp) {
    panelStyle.bottom = Math.max(8, window.innerHeight - coords.btnTop + 8)
    delete panelStyle.top
  }

  return (
    <div className="sdm-root" ref={rootRef}>
      <div className="sdm-tabs" role="tablist" aria-label="منوی اصلی">
        {sections.map((section, idx) => {
          const Icon = section.icon
          const isOpen = openId === section.id
          const isActiveSection = section.subs?.some((s) => s.id === activeSubId)
          const badge = getSectionBadge?.(section) || 0
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              ref={(el) => {
                btnRefs.current[section.id] = el
              }}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              aria-controls={isOpen ? `sdm-popover-${section.id}` : undefined}
              aria-selected={isOpen || isActiveSection}
              className={`sdm-tab tone-${idx} ${isOpen ? 'is-open' : ''} ${isActiveSection && !isOpen ? 'is-active-section' : ''}`}
              onClick={() => onToggle?.(isOpen ? null : section.id)}
            >
              <span className="sdm-tab-ico">
                <Icon className="w-4 h-4" />
              </span>
              <span className="sdm-tab-label">{section.label}</span>
              <ChevronDown className={`sdm-tab-chev ${isOpen ? 'is-open' : ''}`} />
              <TabBadge count={badge} title={`${badge} مورد جدید در ${section.label}`} />
            </button>
          )
        })}
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {openSection && (
              <motion.div
                key={openSection.id}
                ref={panelRef}
                id={`sdm-popover-${openSection.id}`}
                role="menu"
                aria-label={`زیرمنوی ${openSection.label}`}
                className={`sdm-popover tone-${openIndex}`}
                style={panelStyle as CSSProperties}
                initial={{ opacity: 0, y: coords.openUp ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: coords.openUp ? 6 : -6, scale: 0.98 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="sdm-popover-arrow" data-dir={coords.openUp ? 'up' : 'down'} />
                <div className="sdm-popover-head">
                  <p className="sdm-popover-title">{openSection.label}</p>
                </div>
                <div className="sdm-popover-list">
                  {openSection.subs.map((sub) => {
                    const SIcon = sub.icon
                    const active = activeSubId === sub.id
                    const subBadge = getSubBadge?.(sub) || 0
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        role="menuitem"
                        className={`sdm-popover-item ${active ? 'is-active' : ''}`}
                        onClick={() => onSelectSub?.(openSection.id, sub.id)}
                      >
                        <span className="sdm-popover-item-right">
                          {SIcon ? (
                            <span className="sdm-popover-ico">
                              <SIcon className="w-3.5 h-3.5" />
                            </span>
                          ) : null}
                          <span className="sdm-popover-item-label">{sub.label}</span>
                        </span>
                        <TabBadge count={subBadge} title={`${subBadge} جدید — ${sub.label}`} />
                      </button>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
