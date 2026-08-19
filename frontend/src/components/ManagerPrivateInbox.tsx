import { useCallback, useEffect, useState } from 'react'
import {
  MessageSquare,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  Home,
  Clock3,
} from 'lucide-react'
import PrivateChat from './PrivateChat'
import TabBadge from './TabBadge'
import type { AdminUser, ChangedHandler, Resident } from '../types'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fa-IR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function previewText(row) {
  if (!row) return ''
  if (row.last_message_type === 'voice') return '🎤 پیام صوتی'
  const t = String(row.last_message || '').trim()
  if (!t) return '—'
  return t.length > 70 ? `${t.slice(0, 70)}…` : t
}

export default function ManagerPrivateInbox({
  admin,
  residents = [],
  onChanged,
}: {
  admin: AdminUser
  residents?: Resident[]
  onChanged?: ChangedHandler
}) {
  const [inbox, setInbox] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeUnit, setActiveUnit] = useState('')

  const residentMap = useCallback(() => {
    const map: Record<string, Resident> = {}
    for (const r of residents || []) {
      if (r?.unit_name) map[String(r.unit_name)] = r
    }
    return map
  }, [residents])

  const loadInbox = async ({ silent = false } = {}) => {
    if (!admin) return
    if (!silent) {
      setError('')
      setLoading(true)
    }
    try {
      const q = new URLSearchParams({
        for_manager: '1',
        inbox: '1',
      })
      if (admin.block_number) q.set('block_number', admin.block_number)
      if (admin.block_direction) q.set('block_direction', admin.block_direction)

      const res = await fetch(`/api/private-chat?${q.toString()}`)
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.error || 'خطا در دریافت گفتگوها')
      setInbox(Array.isArray(data) ? data : [])
    } catch (err) {
      if (!silent) {
        setError(err.message || 'خطا')
        setInbox([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadInbox({ silent: false })
    const t = setInterval(() => loadInbox({ silent: true }), 12000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.block_number, admin?.block_direction])

  const openUnit = (unit) => {
    setActiveUnit(unit)
  }

  const backToList = async () => {
    setActiveUnit('')
    await loadInbox({ silent: true })
    onChanged?.()
  }

  const rmap = residentMap()
  const activeResident = activeUnit ? rmap[activeUnit] : null

  if (activeUnit) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={backToList}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 py-2 text-sm font-black text-slate-600 hover:bg-sky-50"
          >
            <ChevronLeft className="w-4 h-4 rotate-180" />
            بازگشت به لیست واحدها
          </button>
          <div className="text-sm font-black text-sky-950">
            واحد {activeUnit}
            {activeResident ? (
              <span className="text-xs font-bold text-slate-600 ms-2">
                {activeResident.first_name} {activeResident.last_name}
              </span>
            ) : null}
          </div>
        </div>

        <PrivateChat
          unit_name={activeUnit}
          block_number={admin.block_number}
          block_direction={admin.block_direction}
          sender_type="manager"
          sender_name={admin.full_name || 'مدیر بلوک'}
          title={`گفتگو با واحد ${activeUnit}`}
          onChanged={() => {
            loadInbox({ silent: true })
            onChanged?.()
          }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="panel-title text-lg">ارتباط با ساکنین</h2>
            <p className="text-xs font-semibold text-slate-600 mt-0.5">
              واحدهایی که پیام فرستاده‌اند — روی شماره واحد بزنید تا وارد گفتگو شوید
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadInbox({ silent: false })}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-sky-800 hover:text-sky-950"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
        </button>
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : inbox.length === 0 ? (
        <div className="panel-card rounded-2xl p-10 text-center text-sky-800 font-semibold text-sm border border-slate-200">
          هنوز پیامی از ساکنین دریافت نشده است
        </div>
      ) : (
        <div className="space-y-2.5">
          {inbox.map((row) => {
            const r = rmap[row.unit_name]
            const unread = Number(row.unread_count) || 0
            const fromResident = row.last_sender_type === 'resident'
            return (
              <button
                key={row.unit_name}
                type="button"
                onClick={() => openUnit(row.unit_name)}
                className={`w-full text-right panel-card rounded-2xl p-4 border-2 transition-all hover:shadow-md active:scale-[0.99] ${
                  unread > 0
                    ? 'border-amber-400 bg-amber-50/50'
                    : 'border-sky-200 bg-white hover:border-sky-400'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 text-white px-3 py-1.5 text-sm font-black shadow-sm">
                        <Home className="w-3.5 h-3.5" />
                        واحد {row.unit_name}
                      </span>
                      {r && (
                        <span className="text-xs font-bold text-slate-600">
                          {r.first_name} {r.last_name}
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="relative inline-flex">
                          <TabBadge count={unread} title={`${unread} پیام خوانده‌نشده`} />
                        </span>
                      )}
                    </div>

                    <p
                      className={`mt-2.5 text-sm font-semibold leading-6 line-clamp-2 ${
                        unread > 0 ? 'text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      <span className="text-sky-800 font-black">
                        {fromResident ? 'ساکن: ' : 'شما: '}
                      </span>
                      {previewText(row)}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="w-3.5 h-3.5" />
                        {formatDate(row.last_at)}
                      </span>
                      <span>{Number(row.total_count || 0).toLocaleString('fa-IR')} پیام</span>
                      {unread > 0 && (
                        <span className="text-amber-700">
                          {unread.toLocaleString('fa-IR')} خوانده‌نشده
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="shrink-0 self-center text-sky-700 font-black text-xs rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2">
                    ورود
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* دسترسی سریع به واحد بدون پیام قبلی */}
      {residents.length > 0 && (
        <div className="panel-card rounded-2xl p-4 border-2 border-slate-200 space-y-2">
          <p className="text-xs font-black text-slate-700">شروع گفتگو با واحد دیگر</p>
          <div className="flex flex-wrap gap-2">
            {residents.map((r) => (
              <button
                key={r.id || r.unit_name}
                type="button"
                onClick={() => openUnit(r.unit_name)}
                className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-sky-50"
              >
                <Home className="w-3 h-3" />
                {r.unit_name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
