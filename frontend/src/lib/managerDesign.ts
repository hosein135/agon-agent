import type { CSSProperties } from 'react'
import type { DesignColor, DesignTheme } from '../types'

export const NEON_COLORS: DesignColor[] = [
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
} satisfies Record<string, DesignColor[]>

export const DESIGN_COLORS = {
  tabs: [...BASE_COLORS.tabs, ...NEON_COLORS],
  backlight: [...BASE_COLORS.backlight, ...NEON_COLORS],
  background: [...BASE_COLORS.background, ...NEON_COLORS],
}

export const DEFAULT_DESIGN: DesignTheme = {
  tabs: '#4f46e5',
  backlight: '#a78bfa',
  background: '#f4f4f5',
}

export function loadDesign(key: string): DesignTheme {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { ...DEFAULT_DESIGN }
    const parsed = JSON.parse(raw) as Partial<DesignTheme>
    return {
      tabs: parsed.tabs || DEFAULT_DESIGN.tabs,
      backlight: parsed.backlight || DEFAULT_DESIGN.backlight,
      background: parsed.background || DEFAULT_DESIGN.background,
    }
  } catch {
    return { ...DEFAULT_DESIGN }
  }
}

export function saveDesign(key: string, design: DesignTheme) {
  try {
    localStorage.setItem(key, JSON.stringify(design))
  } catch {
    /* ignore */
  }
}

function hexToRgb(hex: string) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return { r: 79, g: 70, b: 229 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function mixHex(hex: string, withWhite = 0.35) {
  const { r, g, b } = hexToRgb(hex)
  const m = (c: number) => Math.round(c + (255 - c) * withWhite)
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`
}

function darkenHex(hex: string, amount = 0.25) {
  const { r, g, b } = hexToRgb(hex)
  const d = (c: number) => Math.max(0, Math.round(c * (1 - amount)))
  return `rgb(${d(r)}, ${d(g)}, ${d(b)})`
}

export function designToCssVars(design: DesignTheme) {
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
  } as CSSProperties & Record<`--${string}`, string>
}
