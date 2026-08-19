import { useState } from 'react'
import {
  Users,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  Phone,
  Home,
  Layers,
  BadgeCheck,
  User,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import type { AdminUser, ChangedHandler, Resident } from '../types'

export default function ResidentsManager({
  admin,
  residents = [],
  loading = false,
  onChanged,
}: {
  admin: AdminUser
  residents?: Resident[]
  loading?: boolean
  onChanged?: ChangedHandler
}) {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({
    unit_name: '',
    first_name: '',
    last_name: '',
    floor: '',
    occupancy: 'مالک',
    people_count: '1',
    phone: '',
    pin: '',
  })

  const startEdit = (r) => {
    setEditingId(r.id)
    setEditForm({
      unit_name: r.unit_name || '',
      first_name: r.first_name || '',
      last_name: r.last_name || '',
      floor: r.floor || '',
      occupancy: r.occupancy || 'مالک',
      people_count: String(r.people_count != null ? r.people_count : 1),
      phone: r.phone || '',
      pin: '',
    })
    setError('')
    setSuccess('')
  }

  const saveEdit = async (current) => {
    setBusyId(current.id)
    setError('')
    setSuccess('')
    try {
      if (!editForm.unit_name.trim() || !editForm.first_name.trim() || !editForm.last_name.trim()) {
        throw new Error('نام واحد، نام و نام خانوادگی الزامی است')
      }
      const people = Number(toEnglishDigits(editForm.people_count).replace(/\D/g, ''))
      if (!Number.isFinite(people) || people < 1) {
        throw new Error('تعداد نفرات باید حداقل ۱ باشد')
      }

      const payload: any = {
        id: current.id,
        block_number: current.block_number || admin?.block_number || '',
        block_direction: current.block_direction || admin?.block_direction || '',
        unit_name: editForm.unit_name.trim(),
        floor: toEnglishDigits(editForm.floor).trim() || '1',
        occupancy: editForm.occupancy || 'مالک',
        people_count: people,
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        phone: onlyDigits(editForm.phone) || toEnglishDigits(editForm.phone).trim(),
      }
      if (editForm.pin?.trim()) {
        payload.pin = toEnglishDigits(editForm.pin).trim()
      }

      const res = await fetch('/api/residents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ویرایش ناموفق بود')

      setEditingId(null)
      setSuccess(`اطلاعات ساکن واحد ${payload.unit_name} به‌روزرسانی شد`)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'خطا در ویرایش')
    } finally {
      setBusyId(null)
    }
  }

  const removeResident = async (r) => {
    if (!confirm(`آیا از حذف ساکن واحد ${r.unit_name} مطمئن هستید؟`)) return
    setBusyId(r.id)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/residents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'حذف ناموفق بود')
      setSuccess(`ساکن واحد ${r.unit_name} حذف شد`)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'خطا در حذف')
    } finally {
      setBusyId(null)
    }
  }

  const toggleOccupant = async (r, next) => {
    setBusyId(r.id)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/residents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: r.id,
          is_occupant: next,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ذخیره وضعیت ساکن ناموفق بود')
      setSuccess(
        next
          ? `${r.first_name} ${r.last_name} به‌عنوان ساکن فعلی واحد ${r.unit_name} ثبت شد`
          : `تیک ساکن فعلی برای ${r.first_name} ${r.last_name} برداشته شد`,
      )
      onChanged?.()
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setBusyId(null)
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
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-sky-700" />
          <h2 className="panel-title text-lg">لیست ساکنین</h2>
        </div>
        <span className="text-xs font-black text-sky-800 bg-sky-50 border border-sky-200 rounded-full px-2.5 py-1">
          {residents.length.toLocaleString('fa-IR')} واحد
        </span>
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="msg-success flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {residents.length === 0 ? (
        <div className="panel-card rounded-2xl p-8 text-center text-sky-800 font-semibold">
          ساکنی ثبت نشده است
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {residents.map((r) => {
            const editing = editingId === r.id
            const blocked = r.status === 'blocked'
            return (
              <div key={r.id || r.unit_name} className={`resident-box ${blocked ? 'is-blocked' : 'is-active'}`}>
                {editing ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">واحد</span>
                        <input
                          className="field-input !py-2"
                          value={editForm.unit_name}
                          onChange={(e) => setEditForm((p) => ({ ...p, unit_name: e.target.value }))}
                        />
                      </label>
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">طبقه</span>
                        <input
                          className="field-input !py-2 dir-ltr"
                          value={editForm.floor}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, floor: toEnglishDigits(e.target.value) }))
                          }
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">نام</span>
                        <input
                          className="field-input !py-2"
                          value={editForm.first_name}
                          onChange={(e) => setEditForm((p) => ({ ...p, first_name: e.target.value }))}
                        />
                      </label>
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">نام خانوادگی</span>
                        <input
                          className="field-input !py-2"
                          value={editForm.last_name}
                          onChange={(e) => setEditForm((p) => ({ ...p, last_name: e.target.value }))}
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">وضعیت سکونت</span>
                        <select
                          className="field-input !py-2"
                          value={editForm.occupancy}
                          onChange={(e) => setEditForm((p) => ({ ...p, occupancy: e.target.value }))}
                        >
                          <option value="مالک">مالک</option>
                          <option value="مستاجر">مستاجر</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">تعداد نفرات</span>
                        <input
                          className="field-input !py-2 dir-ltr"
                          value={editForm.people_count}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              people_count: toEnglishDigits(e.target.value),
                            }))
                          }
                          inputMode="numeric"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="field-label text-xs mb-1 block">تلفن</span>
                      <input
                        className="field-input !py-2 dir-ltr"
                        value={editForm.phone}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, phone: toEnglishDigits(e.target.value) }))
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="field-label text-xs mb-1 block">رمز جدید (اختیاری)</span>
                      <input
                        className="field-input !py-2 dir-ltr"
                        type="password"
                        value={editForm.pin}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, pin: toEnglishDigits(e.target.value) }))
                        }
                        placeholder="خالی = بدون تغییر"
                      />
                    </label>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => saveEdit(r)}
                        className="bill-box-btn is-confirm flex-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        ذخیره
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="bill-box-btn is-cancel flex-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        لغو
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="resident-box-top">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="resident-avatar">
                          <User className="w-4 h-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="resident-name">
                            {r.first_name} {r.last_name}
                            {r.is_occupant && (
                              <span className="ms-1.5 inline-flex align-middle text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-full px-1.5 py-0.5">
                                ساکن
                              </span>
                            )}
                          </p>
                          <p className="resident-unit">واحد {r.unit_name}</p>
                        </div>
                      </div>
                      <span className={`pay-status ${blocked ? 'is-unpaid' : 'is-paid'}`}>
                        {blocked ? 'مسدود' : 'فعال'}
                      </span>
                    </div>

                    <label
                      className={`mt-2 flex items-center gap-2 rounded-xl border-2 px-3 py-2 cursor-pointer select-none ${
                        r.is_occupant
                          ? 'border-emerald-300 bg-emerald-50/90'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-emerald-600"
                        checked={Boolean(r.is_occupant)}
                        disabled={busyId === r.id}
                        onChange={(e) => toggleOccupant(r, e.target.checked)}
                      />
                      <span
                        className={`text-xs font-black ${
                          r.is_occupant ? 'text-emerald-950' : 'text-slate-700'
                        }`}
                      >
                        ساکن فعلی واحد
                        <span
                          className={`block text-[10px] font-bold leading-4 mt-0.5 ${
                            r.is_occupant ? 'text-emerald-800' : 'text-slate-600'
                          }`}
                        >
                          {r.is_occupant
                            ? 'این واحد در محاسبه نفرات و صدور قبض «ساکن» لحاظ می‌شود'
                            : 'بدون تیک: واحد از محاسبه آب و صدور گروهی «ساکن» حذف می‌شود'}
                        </span>
                      </span>
                    </label>

                    <div className="bill-box-grid">
                      <div className="bill-box-field">
                        <span className="inline-flex items-center gap-1">
                          <Home className="w-3.5 h-3.5" />
                          واحد
                        </span>
                        <strong>{r.unit_name}</strong>
                      </div>
                      <div className="bill-box-field">
                        <span className="inline-flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" />
                          طبقه
                        </span>
                        <strong>{r.floor || '—'}</strong>
                      </div>
                      <div className="bill-box-field">
                        <span className="inline-flex items-center gap-1">
                          <BadgeCheck className="w-3.5 h-3.5" />
                          وضعیت سکونت
                        </span>
                        <strong>{r.occupancy || '—'}</strong>
                      </div>
                      <div className="bill-box-field">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          تعداد نفرات
                        </span>
                        <strong>
                          {r.people_count != null
                            ? `${Number(r.people_count).toLocaleString('fa-IR')} نفر`
                            : '—'}
                        </strong>
                      </div>
                      <div className="bill-box-field">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          تلفن
                        </span>
                        <strong className="dir-ltr">{r.phone || '—'}</strong>
                      </div>
                    </div>

                    <div className="bill-box-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => startEdit(r)}
                        className="bill-box-btn is-edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        ویرایش
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => removeResident(r)}
                        className="bill-box-btn is-delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
