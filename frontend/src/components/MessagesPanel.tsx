import { useEffect, useState } from 'react'
import { Bell, CheckCheck, AlertCircle } from 'lucide-react'
import { fetchMessages, markMessageRead, markTabRead } from '../lib/messages'
import type { ChangedHandler } from '../types'

/**
 * Supports a single audience key, or multiple keys via audience_keys[].
 */
export default function MessagesPanel({
  audience_type,
  audience_key,
  audience_keys,
  onChanged,
}: {
  audience_type: string
  audience_key?: string
  audience_keys?: string[]
  onChanged?: ChangedHandler
}) {
  const keys = audience_keys?.length
    ? audience_keys
    : audience_key
      ? [audience_key]
      : []

  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try {
      const results = await Promise.all(keys.map((k) => fetchMessages(audience_type, k)))
      const map = new Map()
      for (const data of results) {
        for (const m of data.messages || []) {
          map.set(m.id, m)
        }
      }
      const list = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setMessages(list)
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری پیام‌ها')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!audience_type || !keys.length) return
    setLoading(true)
    load()
    Promise.all(keys.map((k) => markTabRead(audience_type, k, 'messages')))
      .then(() => onChanged?.())
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience_type, keys.join('|')])

  const formatDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('fa-IR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const markOne = async (id) => {
    try {
      await markMessageRead(id)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    }
  }

  const markAll = async () => {
    try {
      await Promise.all(keys.map((k) => markTabRead(audience_type, k, 'messages')))
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="panel-title text-lg flex items-center gap-2">
          <Bell className="w-5 h-5 text-indigo-600" />
          پیام‌ها
        </h2>
        <button type="button" onClick={markAll} className="btn-ghost !py-2 !px-3 text-xs">
          <CheckCheck className="w-4 h-4" />
          خواندن همه
        </button>
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="panel-card rounded-2xl p-8 text-center text-sky-800 font-semibold">
          پیامی وجود ندارد
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-2xl border-2 p-4 transition-colors ${
                m.is_read
                  ? 'bg-white border-sky-200'
                  : 'bg-rose-50 border-rose-300 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {!m.is_read && (
                      <span className="status-badge status-rejected !text-[10px]">جدید</span>
                    )}
                    <h3 className="font-extrabold text-slate-900">{m.title}</h3>
                  </div>
                  {m.body && (
                    <p className="text-sm text-slate-700 font-semibold mt-1.5 leading-6">{m.body}</p>
                  )}
                  <p className="text-xs text-sky-700 font-semibold mt-2">{formatDate(m.created_at)}</p>
                </div>
                {!m.is_read && (
                  <button
                    type="button"
                    onClick={() => markOne(m.id)}
                    className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-100 text-slate-600 border border-sky-300 hover:bg-sky-600 hover:text-white transition-colors"
                  >
                    خواندم
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
