import {
  clearSession,
  getSession,
  getSessionToken,
  isAbsTimedOut,
  isIdleTimedOut,
  SESSION_POLL_MS,
  touchActivity,
} from './session'

let started = false
let pollTimer: ReturnType<typeof setInterval> | null = null
let kicking = false

function loginPath(reason: string) {
  return `/?reason=${encodeURIComponent(reason)}`
}

export function kickToLogin(reason: 'replaced' | 'expired' | 'revoked' = 'expired') {
  if (kicking) return
  if (typeof window === 'undefined') return
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '') {
    clearSession()
    return
  }
  kicking = true
  clearSession()
  window.location.replace(loginPath(reason))
}

function sessionErrorCode(data: any, status: number): 'replaced' | 'expired' | 'revoked' | '' {
  const code = String(data?.code || '')
  if (code === 'session_replaced') return 'replaced'
  if (code === 'session_revoked') return 'revoked'
  if (code === 'session_expired') return 'expired'
  if (status === 401 && /نشست|منقضی|دستگاه دیگری/.test(String(data?.error || ''))) {
    return 'expired'
  }
  return ''
}

function patchFetch() {
  if (typeof window === 'undefined' || (window.fetch as any).__agonSession) return
  const orig = window.fetch.bind(window)
  const wrapped: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
    const url = String(input instanceof Request ? input.url : input)
    const isApi = url.includes('/api/')
    const token = getSessionToken()
    if (isApi && token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    const nextInit: RequestInit = { ...init, headers }
    const res = await orig(input as RequestInfo, nextInit)
    if (isApi && (res.status === 401 || res.status === 403) && token) {
      try {
        const data = await res.clone().json()
        const reason = sessionErrorCode(data, res.status)
        if (reason) kickToLogin(reason)
      } catch {
        /* ignore non-json */
      }
    }
    return res
  }
  ;(wrapped as any).__agonSession = true
  window.fetch = wrapped
}

async function heartbeat() {
  const session = getSession()
  if (!session?.token) return
  if (isAbsTimedOut(session) || isIdleTimedOut()) {
    kickToLogin('expired')
    return
  }
  try {
    const res = await fetch('/api/session', {
      method: isIdleTimedOut() ? 'GET' : 'POST',
      cache: 'no-store',
    })
    if (res.ok) return
    try {
      const data = await res.json()
      const reason = sessionErrorCode(data, res.status) || 'expired'
      kickToLogin(reason)
    } catch {
      if (res.status === 401) kickToLogin('expired')
    }
  } catch {
    /* offline: keep local session */
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(heartbeat, SESSION_POLL_MS)
  heartbeat()
}

export function initSessionClient() {
  if (typeof window === 'undefined') return
  if (started) return
  started = true
  patchFetch()

  const onActivity = () => {
    if (getSessionToken()) touchActivity()
  }
  window.addEventListener('pointerdown', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity)
  window.addEventListener('focus', onActivity)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') heartbeat()
  })

  startPolling()
}
