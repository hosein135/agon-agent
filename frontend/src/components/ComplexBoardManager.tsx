import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  UsersRound,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Shield,
  Phone,
  User,
  Briefcase,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import {
  PERMISSION_DEFS,
  ROLE_PRESETS,
  permissionsForTitle,
} from '../lib/boardPermissions'
import type { AdminUser, ChangedHandler } from '../types'

const emptyForm = {
  full_name: '',
  phone: '',
  title: 'مسئول تأسیسات',
  custom_title: '',
  responsibility: '',
  password: '',
  permissions: permissionsForTitle('مسئول تأسیسات'),
}

export default function ComplexBoardManager({
  admin,
  onChanged,
}: {
  admin: AdminUser
  onChanged?: ChangedHandler
}) {
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const complexName = admin?.complex_name || ''

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/board-members?complex_name=${encodeURIComponent(complexName)}`,
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت هیئت مدیره')
      setMembers(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }, [complexName])

  useEffect(() => {
    if (complexName) load()
  }, [complexName, load])

  const titleOptions = useMemo(() => [...Object.keys(ROLE_PRESETS), 'سایر'], [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm, permissions: permissionsForTitle('مسئول تأسیسات') })
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  const openEdit = (m) => {
    setEditingId(m.id)
    const isPreset = Object.keys(ROLE_PRESETS).includes(m.title)
    setForm({
      full_name: m.full_name || '',
      phone: m.phone || '',
      title: isPreset ? m.title : 'سایر',
      custom_title: isPreset ? '' : m.title || '',
      responsibility: m.responsibility || '',
      password: '',
      permissions: permissionsForTitle(m.title, m.permissions),
    })
    setShowForm(true)
    setError('')
    setSuccess('')
  }

  const setTitle = (title) => {
    setForm((p) => ({
      ...p,
      title,
      permissions: title === 'سایر' ? p.permissions : permissionsForTitle(title),
    }))
  }

  const togglePerm = (key) => {
    setForm((p) => ({
      ...p,
      permissions: { ...p.permissions, [key]: !p.permissions[key] },
    }))
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setBusyId(editingId || 'new')
    try {
      const title =
        form.title === 'سایر' ? String(form.custom_title || '').trim() : form.title
      if (!form.full_name.trim()) throw new Error('نام الزامی است')
      if (!title) throw new Error('سمت الزامی است')
      if (!editingId && String(form.password).trim().length < 4) {
        throw new Error('رمز ورود عضو حداقل ۴ کاراکتر باشد')
      }

      const payload: any = {
        complex_name: complexName,
        full_name: form.full_name.trim(),
        phone: onlyDigits(form.phone) || toEnglishDigits(form.phone).trim(),
        title,
        responsibility: form.responsibility.trim(),
        permissions: form.permissions,
        created_by: admin?.full_name || admin?.complex_name || 'مدیر مجتمع',
      }
      if (form.password.trim()) payload.password = toEnglishDigits(form.password).trim()

      let res
      if (editingId) {
        res = await fetch('/api/board-members', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        })
      } else {
        res = await fetch('/api/board-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ذخیره ناموفق بود')
      setSuccess(editingId ? 'عضو هیئت مدیره به‌روز شد' : 'عضو هیئت مدیره ثبت شد')
      setShowForm(false)
      setEditingId(null)
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (m) => {
    if (!confirm(`حذف «${m.full_name} — ${m.title}»؟`)) return
    setBusyId(m.id)
    setError('')
    try {
      const res = await fetch('/api/board-members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'حذف ناموفق')
      setSuccess('حذف شد')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const toggleStatus = async (m) => {
    setBusyId(m.id)
    try {
      const res = await fetch('/api/board-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: m.id,
          status: m.status === 'inactive' ? 'active' : 'inactive',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 flex items-center justify-center border-2 border-indigo-200">
            <UsersRound className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="panel-title text-lg">هیئت مدیره مجتمع</h2>
            <p className="text-xs font-semibold text-slate-600">
              تعیین سمت، مسئولیت و دسترسی ارتباط/مالی/تعمیرات
            </p>
          </div>
        </div>
        <button type="button" onClick={openCreate} className="btn-admin !mt-0 !py-2 inline-flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          ثبت عضو جدید
        </button>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-bold text-indigo-950 leading-6">
        هر عضو با سمت (مالی، تأسیسات، برقکار و …) ثبت می‌شود. دسترسی‌ها را خودتان تیک بزنید؛ مثلاً مسئول
        تأسیسات درخواست تعمیر از مدیر بلوک می‌گیرد و با هماهنگی اقدام می‌کند. مسئول مالی گزارش مالی را
        می‌بیند و به مدیر بلوک اطلاع می‌دهد.
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

      {showForm && (
        <form onSubmit={save} className="panel-card rounded-2xl border-2 border-indigo-200 p-4 space-y-3">
          <p className="font-black text-slate-900 text-sm">
            {editingId ? 'ویرایش عضو هیئت مدیره' : 'ثبت‌نام عضو هیئت مدیره'}
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label text-xs mb-1 block">نام و نام خانوادگی</span>
              <input
                className="field-input"
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                required
              />
            </label>
            <label className="block">
              <span className="field-label text-xs mb-1 block">شماره تماس (برای ورود)</span>
              <input
                className="field-input dir-ltr"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: toEnglishDigits(e.target.value) }))}
                placeholder="0912..."
              />
            </label>
            <label className="block">
              <span className="field-label text-xs mb-1 block">سمت</span>
              <select
                className="field-input"
                value={form.title}
                onChange={(e) => setTitle(e.target.value)}
              >
                {titleOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {form.title === 'سایر' && (
              <label className="block">
                <span className="field-label text-xs mb-1 block">عنوان سفارشی</span>
                <input
                  className="field-input"
                  value={form.custom_title}
                  onChange={(e) => setForm((p) => ({ ...p, custom_title: e.target.value }))}
                  placeholder="مثلاً مسئول فضای سبز"
                  required
                />
              </label>
            )}
            <label className="block sm:col-span-2">
              <span className="field-label text-xs mb-1 block">شرح مسئولیت کاری</span>
              <textarea
                className="field-input min-h-[72px] resize-y"
                value={form.responsibility}
                onChange={(e) => setForm((p) => ({ ...p, responsibility: e.target.value }))}
                placeholder="وظایف و محدوده کاری"
              />
            </label>
            <label className="block">
              <span className="field-label text-xs mb-1 block">
                {editingId ? 'رمز جدید (اختیاری)' : 'رمز ورود (حداقل ۴ کاراکتر)'}
              </span>
              <input
                type="password"
                className="field-input dir-ltr"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: toEnglishDigits(e.target.value) }))}
                minLength={editingId ? 0 : 4}
                required={!editingId}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              دسترسی‌ها و گزینه‌های ارتباطی
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {PERMISSION_DEFS.map((p) => (
                <label
                  key={p.key}
                  className="flex items-start gap-2 rounded-lg border border-white bg-white px-2.5 py-2 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(form.permissions[p.key])}
                    onChange={() => togglePerm(p.key)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={busyId != null} className="btn-primary !mt-0 flex-1">
              {busyId != null ? 'در حال ذخیره...' : editingId ? 'ذخیره تغییرات' : 'ثبت عضو'}
            </button>
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-12 text-sky-800 font-semibold text-sm">
          هنوز عضوی در هیئت مدیره ثبت نشده است
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {members.map((m) => {
            const perms = Object.entries(m.permissions || {}).filter(([, v]) => v)
            return (
              <article
                key={m.id}
                className={`rounded-2xl border-2 bg-white/95 p-3.5 space-y-2 ${
                  m.status === 'inactive' ? 'border-slate-200 opacity-70' : 'border-indigo-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 flex items-center gap-1.5">
                      <User className="w-4 h-4 text-indigo-600 shrink-0" />
                      {m.full_name}
                    </p>
                    <p className="text-xs font-bold text-indigo-800 mt-0.5 flex items-center gap-1">
                      <Briefcase className="w-3.5 h-3.5" />
                      {m.title}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] font-black rounded-full px-2 py-0.5 border ${
                      m.status === 'inactive'
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {m.status === 'inactive' ? 'غیرفعال' : 'فعال'}
                  </span>
                </div>
                {m.phone && (
                  <p className="text-xs font-bold text-slate-600 dir-ltr text-right flex items-center justify-end gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    {m.phone}
                  </p>
                )}
                {m.responsibility && (
                  <p className="text-[11px] font-semibold text-slate-700 leading-5">{m.responsibility}</p>
                )}
                <div className="flex flex-wrap gap-1">
                  {perms.length === 0 ? (
                    <span className="text-[10px] text-slate-500">بدون دسترسی ویژه</span>
                  ) : (
                    perms.slice(0, 6).map(([k]) => {
                      const def = PERMISSION_DEFS.find((d) => d.key === k)
                      return (
                        <span
                          key={k}
                          className="text-[10px] font-bold rounded-full bg-indigo-50 text-indigo-800 border border-indigo-100 px-2 py-0.5"
                        >
                          {def?.label || k}
                        </span>
                      )
                    })
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    className="bill-box-btn is-edit !py-1.5 !text-xs"
                    onClick={() => openEdit(m)}
                    disabled={busyId === m.id}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    className="bill-box-btn is-cancel !py-1.5 !text-xs"
                    onClick={() => toggleStatus(m)}
                    disabled={busyId === m.id}
                  >
                    {m.status === 'inactive' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        فعال
                      </>
                    ) : (
                      <>
                        <X className="w-3.5 h-3.5" />
                        غیرفعال
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    className="bill-box-btn is-delete !py-1.5 !text-xs"
                    onClick={() => remove(m)}
                    disabled={busyId === m.id}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف
                  </button>
                </div>
                <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" />
                  ورود: ثبت‌نام و ورود مدیر → هیئت مدیره — مجتمع «{complexName}» + موبایل + رمز
                </p>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
