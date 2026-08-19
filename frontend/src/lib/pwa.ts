/** Capture install prompt as early as possible (event fires once). */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type PwaState = {
  deferredPrompt: InstallPromptEvent | null
  canInstall: boolean
  installed: boolean
  swReady: boolean
  inIframe: boolean
  secure: boolean
}

type PwaInitOptions = {
  onCacheUpdate?: () => void
}

let deferredPrompt: InstallPromptEvent | null = null
let swRegistration: ServiceWorkerRegistration | null = null
const listeners = new Set<(state: PwaState) => void>()

function emit() {
  listeners.forEach((fn) => {
    try {
      fn(getPwaState())
    } catch (_) {
      /* ignore */
    }
  })
}

export function getPwaState() {
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true)

  const inIframe = (() => {
    try {
      return window.self !== window.top
    } catch {
      return true
    }
  })()

  return {
    deferredPrompt,
    canInstall: !!deferredPrompt && !standalone,
    installed: standalone,
    swReady: !!swRegistration,
    inIframe,
    secure: typeof window !== 'undefined' ? window.isSecureContext : false,
  }
}

export function subscribePwa(fn: (state: PwaState) => void) {
  listeners.add(fn)
  fn(getPwaState())
  return () => {
    listeners.delete(fn)
  }
}

function applyWaitingWorker(
  registration: ServiceWorkerRegistration,
  onCacheUpdate?: () => void,
) {
  const waiting = registration.waiting
  if (!waiting) return
  onCacheUpdate?.()
  waiting.postMessage({ type: 'SKIP_WAITING' })
}

export function initPwa(opts: PwaInitOptions = {}) {
  if (typeof window === 'undefined') return
  if (window.__pwaInit) return
  window.__pwaInit = true

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault()
    deferredPrompt = e as InstallPromptEvent
    window.__pwaDeferred = e as InstallPromptEvent
    emit()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    window.__pwaDeferred = null
    emit()
  })

  if ('serviceWorker' in navigator && window.isSecureContext) {
    const register = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const r of regs) {
          if (r.active && r.active.scriptURL && !r.active.scriptURL.endsWith('/sw.js')) {
            await r.unregister()
          }
        }

        let refreshing = false
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return
          refreshing = true
          opts.onCacheUpdate?.()
          window.location.reload()
        })

        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === 'SW_UPDATE_READY') {
            opts.onCacheUpdate?.()
          }
        })

        swRegistration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        })

        swRegistration.addEventListener('updatefound', () => {
          const incoming = swRegistration?.installing
          if (!incoming) return
          incoming.addEventListener('statechange', () => {
            if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
              applyWaitingWorker(swRegistration, opts.onCacheUpdate)
            }
          })
        })

        if (swRegistration.waiting && navigator.serviceWorker.controller) {
          applyWaitingWorker(swRegistration, opts.onCacheUpdate)
        }

        swRegistration.update().catch(() => {})
        setInterval(() => swRegistration?.update().catch(() => {}), 60_000)
        emit()
      } catch (err) {
        console.warn('[pwa] SW register failed', err)
        emit()
      }
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }
}

export async function promptInstall() {
  const event = deferredPrompt || window.__pwaDeferred
  if (!event) {
    return { ok: false, reason: 'no-prompt' }
  }
  event.prompt()
  const choice = await event.userChoice
  deferredPrompt = null
  window.__pwaDeferred = null
  emit()
  return { ok: choice.outcome === 'accepted', reason: choice.outcome }
}
