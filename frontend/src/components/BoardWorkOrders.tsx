import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Wrench,
  AlertCircle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Send,
} from 'lucide-react'
import { toEnglishDigits } from '../lib/digits'

const STATUSES = ['ثبت‌شده', 'در حال بررسی', 'در حال انجام', 'انجام‌شده', 'رد شده']
const STATUS_STYLE = {
  'ثبت‌شده': 'status-received',
  'در حال بررسی': 'status-review',
  'در حال انجام': 'status-review',
  'انجام‌شده': 'status-approved',
  'رد شده': 'status-rejected',
}

/**
 * mode:
 * - create: مدیر بلوک / مجتمع ایجاد درخواست
 * - manage: عضو هیئت مدیره پیگیری
 * - overview: مدیر مجتمع همه را می‌بیند
 */
export default function BoardWorkOrders({
  mode = 'create',
  complexName = '',
  block_number = '',
  block_direction = '',
  actorName = '',
  actorRole = 'block_manager',
  memberId = null,
  memberTitle = '',
}: {
  mode?: 'create' | 'manage' | 'overview' | string
  complexName?: string
  block_number?: string
  block_direction?: string
  actorName?: string
  actorRole?: string
  memberId?: number | string | null
  memberTitle?: string
}) {
  const [orders, setOrders] = useState<any[]>([])
  const [boardMembers, setBoardMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'تأسیسات',
    priority: 'عادی',
    unit_name: '',
    assigned_member_id: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (complexName) params.set('complex_name', complexName)
      if (mode === 'manage' && memberId) params.set('assigned_member_id', String(memberId))
      if (mode === 'create' && block_number) {
        params.set('block_number', block_number)
        params.set('block_direction', block_direction)
      }
      const [oRes, mRes] = await Promise.all([
        fetch(`/api/board-work-orders?${params.toString()}`),
        complexName
          ? fetch(`/api/board-members?complex_name=${encodeURIComponent(complexName)}`)
          : Promise.resolve(null),
      ])
      const oData = await oRes.json()
      if (!oRes.ok) throw new Error(oData.error || 'خطا در درخواست‌ها')
      setOrders(Array.isArray(oData) ? oData : [])
      if (mRes) {
        const mData = await mRes.json()
        if (mRes.ok) {
          const list = (Array.isArray(mData) ? mData : []).filter(
            (m) => m.status !== 'inactive' && m.permissions?.receive_work_orders,
          )
          setBoardMembers(list)
        }
      }
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }, [complexName, mode, memberId, block_number, block_direction])

  useEffect(() => {
    load()
  }, [load])

  const assignees = useMemo(() => boardMembers, [boardMembers])

  const createOrder = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!form.title.trim()) {
      setError('عنوان درخواست الزامی است')
      return
    }
    setBusyId('new')
    try {
      const assignee = assignees.find((a) => String(a.id) === String(form.assigned_member_id))
      const res = await fetch('/api/board-work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complex_name: complexName,
          block_number,
          block_direction,
          unit_name: form.unit_name,
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          priority: form.priority,
          assigned_member_id: form.assigned_member_id || null,
          assigned_title: assignee?.title || form.category,
          created_by_role: actorRole,
          created_by_name: actorName,
          created_by_block: block_number ? `${block_number} ${block_direction}` : '',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ثبت درخواست ناموفق')
      setSuccess('درخواست برای مسئول مربوطه ارسال شد')
      setForm({
        title: '',
        description: '',
        category: 'تأسیسات',
        priority: 'عادی',
        unit_name: '',
        assigned_member_id: '',
      })
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const updateOrder = async (id, patch) => {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch('/api/board-work-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'به‌روزرسانی ناموفق')
      setSuccess('وضعیت به‌روز شد')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('fa-IR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-orange-600" />
          <h2 className="panel-title text-lg">
            {mode === 'manage' ? 'درخواست‌های کار / تعمیر' : 'ارسال درخواست به هیئت مدیره'}
          </h2>
        </div>
        <button type="button" onClick={load} className="btn-ghost !py-2 !text-xs inline-flex items-center gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
        </button>
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="msg-success flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {(mode === 'create' || mode === 'overview') && (
        <form onSubmit={createOrder} className="panel-card rounded-2xl border-2 border-orange-200 p-4 space-y-3">
          <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-orange-600" />
            درخواست جدید (مثلاً تعمیر برای مسئول تأسیسات)
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block sm:col-span-2">
              <span className="field-label text-xs mb-1 block">عنوان</span>
              <input
                className="field-input"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="خرابی پمپ آب / قطعی برق راهرو"
                required
              />
            </label>
            <label className="block">
              <span className="field-label text-xs mb-1 block">دسته‌بندی</span>
              <select
                className="field-input"
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              >
                <option>تأسیسات</option>
                <option>برق</option>
                <option>نگهبانی</option>
                <option>سایر</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label text-xs mb-1 block">اولویت</span>
              <select
                className="field-input"
                value={form.priority}
                onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
              >
                <option>عادی</option>
                <option>فوری</option>
                <option>اضطراری</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label text-xs mb-1 block">واحد (اختیاری)</span>
              <input
                className="field-input"
                value={form.unit_name}
                onChange={(e) => setForm((p) => ({ ...p, unit_name: e.target.value }))}
                placeholder="مثلاً ۱۷"
              />
            </label>
            <label className="block">
              <span className="field-label text-xs mb-1 block">ارجاع به عضو هیئت مدیره</span>
              <select
                className="field-input"
                value={form.assigned_member_id}
                onChange={(e) => setForm((p) => ({ ...p, assigned_member_id: e.target.value }))}
              >
                <option value="">— انتخاب مسئول —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} — {a.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="field-label text-xs mb-1 block">شرح</span>
              <textarea
                className="field-input min-h-[72px] resize-y"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="جزئیات خرابی و محل"
              />
            </label>
          </div>
          <button type="submit" disabled={busyId === 'new'} className="btn-admin !mt-0 inline-flex items-center gap-2">
            <Send className="w-4 h-4" />
            {busyId === 'new' ? 'در حال ارسال...' : 'ارسال درخواست'}
          </button>
          {assignees.length === 0 && (
            <p className="text-[11px] font-bold text-amber-800">
              هنوز عضوی با دسترسی «دریافت درخواست تعمیر» در هیئت مدیره ثبت نشده است.
            </p>
          )}
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-9 h-9 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-10 text-sky-800 font-semibold text-sm">درخواستی ثبت نشده</div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <article key={o.id} className="rounded-2xl border border-orange-200 bg-white p-3.5 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-black text-slate-900 text-sm">{o.title}</p>
                  <p className="text-[11px] font-bold text-slate-600 mt-0.5">
                    {o.category} · {o.priority}
                    {o.unit_name ? ` · واحد ${o.unit_name}` : ''}
                    {o.block_number ? ` · بلوک ${o.block_number} ${o.block_direction || ''}` : ''}
                  </p>
                </div>
                <span className={`status-badge ${STATUS_STYLE[o.status] || ''}`}>{o.status}</span>
              </div>
              {o.description && (
                <p className="text-xs font-semibold text-slate-700 leading-5">{o.description}</p>
              )}
              <p className="text-[10px] font-bold text-slate-500">
                از: {o.created_by_name || o.created_by_role} · {formatDate(o.created_at)}
                {o.assigned_title ? ` · مسئول: ${o.assigned_title}` : ''}
              </p>
              {o.assignee_note && (
                <p className="text-xs font-bold text-indigo-800 bg-indigo-50 rounded-lg px-2 py-1.5">
                  یادداشت مسئول: {o.assignee_note}
                </p>
              )}

              {mode === 'manage' && (
                <div className="grid sm:grid-cols-2 gap-2 pt-1">
                  <select
                    className="field-input !py-2 !text-xs"
                    value={o.status}
                    disabled={busyId === o.id}
                    onChange={(e) => updateOrder(o.id, { status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field-input !py-2 !text-xs"
                    placeholder="یادداشت اقدام / هماهنگی با مدیر بلوک"
                    defaultValue={o.assignee_note || ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v !== (o.assignee_note || '')) {
                        updateOrder(o.id, { assignee_note: v })
                      }
                    }}
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
