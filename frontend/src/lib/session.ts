import type { Session } from '../types'

const KEY = 'block7_session'
const ACTIVITY_KEY = 'block7_session_activity'
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const SESSION_POLL_MS = 2500

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session))
  touchActivity()
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function getSessionToken(): string {
  return getSession()?.token || ''
}

export function touchActivity() {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

export function lastActivityAt(): number {
  try {
    const n = Number(localStorage.getItem(ACTIVITY_KEY) || 0)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

export function isIdleTimedOut(): boolean {
  const last = lastActivityAt()
  if (!last) return false
  return Date.now() - last > IDLE_TIMEOUT_MS
}

export function isAbsTimedOut(session: Session | null = getSession()): boolean {
  if (!session?.expires_at) return false
  const t = Date.parse(session.expires_at)
  return Number.isFinite(t) && Date.now() > t
}

export function clearSession() {
  const token = getSessionToken()
  localStorage.removeItem(KEY)
  localStorage.removeItem(ACTIVITY_KEY)
  if (token && typeof fetch === 'function') {
    fetch('/api/session', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    }).catch(() => {})
  }
}
