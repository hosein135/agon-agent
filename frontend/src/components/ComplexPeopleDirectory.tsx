import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Users,
  AlertCircle,
  RefreshCw,
  Search,
  ArrowRight,
  Phone,
  Home,
  Building2,
  Briefcase,
  BadgeCheck,
  CalendarDays,
  User,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import type { AdminUser, Resident } from '../types'

function phoneKey(p) {
  return onlyDigits(p) || toEnglishDigits(p || '').replace(/\D/g, '')
}

function nameKey(first, last, full?) {
  if (full) return String(full).trim().replace(/\s+/g, ' ')
  return `${String(first || '').trim()} ${String(last || '').trim()}`.trim().replace(/\s+/g, ' ')
}

function formatDate(iso) {
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

/**
 * فهرست یکپارچه افراد مجتمع برای مدیر مجتمع
 * ستون‌ها: سمت | نام و نام خانوادگی | زمان ثبت‌نام
 * لمس ردیف → جزئیات کامل
 */
export default function ComplexPeopleDirectory({
  admin,
  residents: residentsProp = [],
  blockManagers: blockManagersProp = [],
}: {
  admin: AdminUser
  residents?: Resident[]
  blockManagers?: AdminUser[]
}) {
  const [residents, setResidents] = useState(residentsProp)
  const [blockManagers, setBlockManagers] = useState(blockManagersProp)
  const [boardMembers, setBoardMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)

  const complexName = admin?.complex_name || ''

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rRes, bRes, mRes] = await Promise.all([
        fetch('/api/residents'),
        fetch('/api/auth-block-manager'),
        complexName
          ? fetch(`/api/board-members?complex_name=${encodeURIComponent(complexName)}`)
          : Promise.resolve(null),
      ])
      const rData = await rRes.json()
      const bData = await bRes.json()
      if (!rRes.ok) throw new Error(rData.error || 'خطا در ساکنین')
      if (!bRes.ok) throw new Error(bData.error || 'خطا در مدیران بلوک')
      setResidents(Array.isArray(rData) ? rData : [])
      setBlockManagers(Array.isArray(bData) ? bData : [])
      if (mRes) {
        const mData = await mRes.json()
        if (!mRes.ok) throw new Error(mData.error || 'خطا در هیئت مدیره')
        setBoardMembers(Array.isArray(mData) ? mData : [])
      } else {
        setBoardMembers([])
      }
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری')
    } finally {
      setLoading(false)
    }
  }, [complexName])

  useEffect(() => {
    load()
  }, [load])

  // sync props when parent refreshes
  useEffect(() => {
    if (Array.isArray(residentsProp) && residentsProp.length) setResidents(residentsProp)
  }, [residentsProp])
  useEffect(() => {
    if (Array.isArray(blockManagersProp) && blockManagersProp.length) setBlockManagers(blockManagersProp)
  }, [blockManagersProp])

  const rows = useMemo(() => {
    const list: any[] = []

    // index residents by phone and name for linking roles
    const byPhone = new Map()
    const byName = new Map()
    for (const r of residents || []) {
      const pk = phoneKey(r.phone)
      const nk = nameKey(r.first_name, r.last_name)
      if (pk) byPhone.set(pk, r)
      if (nk) byName.set(nk, r)
    }

    const findResidentFor = (phone, fullName) => {
      const pk = phoneKey(phone)
      if (pk && byPhone.has(pk)) return byPhone.get(pk)
      const nk = nameKey('', '', fullName)
      if (nk && byName.has(nk)) return byName.get(nk)
      return null
    }

    // --- Residents (base) ---
    for (const r of residents || []) {
      const full = `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—'
      list.push({
        id: `resident-${r.id}`,
        kind: 'resident',
        sortName: full,
        full_name: full,
        first_name: r.first_name,
        last_name: r.last_name,
        phone: r.phone,
        created_at: r.created_at,
        role_label: 'ساکن',
        role_detail: `واحد ${r.unit_name} — بلوک ${r.block_number} ${r.block_direction || ''}`.trim(),
        unit_name: r.unit_name,
        block_number: r.block_number,
        block_direction: r.block_direction,
        floor: r.floor,
        occupancy: r.occupancy,
        people_count: r.people_count,
        status: r.status,
        raw: r,
        roles: ['ساکن'],
      })
    }

    // --- Block managers ---
    for (const bm of blockManagers || []) {
      const full = (bm.full_name || `مدیر بلوک ${bm.block_number}`).trim()
      const linked = findResidentFor(bm.phone, full)
      const roleParts = [`مدیر بلوک ${bm.block_number} ${bm.block_direction || ''}`.trim()]
      if (linked?.unit_name) {
        roleParts.push(`ساکن واحد ${linked.unit_name}`)
      }

      // if already have resident row linked by phone/name, enrich instead of duplicate when same person
      if (linked) {
        const existing = list.find((x) => x.kind === 'resident' && x.raw?.id === linked.id)
        if (existing) {
          existing.roles = Array.from(new Set([...(existing.roles || []), 'مدیر بلوک']))
          existing.role_label = roleParts.join(' · ')
          existing.role_detail = existing.role_detail
          existing.block_manager = bm
          existing.kind = 'multi'
          existing.id = `multi-r${linked.id}-bm${bm.id || bm.block_number}`
          continue
        }
      }

      list.push({
        id: `bm-${bm.id || `${bm.block_number}-${bm.block_direction}`}`,
        kind: 'block_manager',
        sortName: full,
        full_name: full,
        phone: bm.phone || linked?.phone || '',
        created_at: bm.created_at || linked?.created_at,
        role_label: roleParts.join(' · '),
        role_detail: linked?.unit_name
          ? `واحد ${linked.unit_name} — بلوک ${bm.block_number} ${bm.block_direction || ''}`
          : `بلوک ${bm.block_number} ${bm.block_direction || ''}`,
        unit_name: linked?.unit_name || '',
        block_number: bm.block_number,
        block_direction: bm.block_direction,
        floor: linked?.floor,
        occupancy: linked?.occupancy,
        people_count: linked?.people_count,
        status: 'active',
        block_manager: bm,
        linked_resident: linked,
        roles: linked ? ['مدیر بلوک', 'ساکن'] : ['مدیر بلوک'],
        raw: bm,
      })
    }

    // --- Board members ---
    for (const m of boardMembers || []) {
      const full = (m.full_name || m.title || 'عضو هیئت مدیره').trim()
      const linked = findResidentFor(m.phone, full)
      const roleParts = [`هیئت مدیره — ${m.title || 'عضو'}`]
      if (linked?.unit_name) {
        roleParts.push(`ساکن واحد ${linked.unit_name}`)
      }

      // enrich existing resident row if same person
      if (linked) {
        const existing = list.find(
          (x) =>
            (x.kind === 'resident' || x.kind === 'multi') &&
            (x.raw?.id === linked.id || x.linked_resident?.id === linked.id),
        )
        if (existing && existing.kind !== 'board') {
          existing.roles = Array.from(new Set([...(existing.roles || []), 'هیئت مدیره', m.title].filter(Boolean)))
          const bits = [existing.role_label]
          if (!String(existing.role_label).includes('هیئت مدیره')) {
            bits.push(`هیئت مدیره — ${m.title}`)
          }
          existing.role_label = bits.filter(Boolean).join(' · ')
          existing.board_member = m
          existing.kind = 'multi'
          existing.id = `${existing.id}-board${m.id}`
          continue
        }
      }

      list.push({
        id: `board-${m.id}`,
        kind: 'board',
        sortName: full,
        full_name: full,
        phone: m.phone || linked?.phone || '',
        created_at: m.created_at || linked?.created_at,
        role_label: roleParts.join(' · '),
        role_detail: linked?.unit_name
          ? `واحد ${linked.unit_name} — بلوک ${linked.block_number} ${linked.block_direction || ''}`
          : m.responsibility || m.title,
        unit_name: linked?.unit_name || '',
        block_number: linked?.block_number || '',
        block_direction: linked?.block_direction || '',
        floor: linked?.floor,
        occupancy: linked?.occupancy,
        people_count: linked?.people_count,
        status: m.status,
        title: m.title,
        responsibility: m.responsibility,
        permissions: m.permissions,
        board_member: m,
        linked_resident: linked,
        roles: linked ? ['هیئت مدیره', 'ساکن'] : ['هیئت مدیره'],
        raw: m,
      })
    }

    list.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      if (tb !== ta) return tb - ta
      return String(a.sortName).localeCompare(String(b.sortName), 'fa')
    })

    return list
  }, [residents, blockManagers, boardMembers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) =>
      [r.full_name, r.role_label, r.role_detail, r.phone, r.unit_name, r.block_number, r.title]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  if (selected) {
    return (
      <PersonDetail
        person={selected}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center border-2 border-indigo-200">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="panel-title text-lg">فهرست افراد مجتمع</h2>
            <p className="text-xs font-semibold text-slate-600">
              ساکنین، مدیران بلوک و هیئت مدیره — لمس هر ردیف برای جزئیات
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          بروزرسانی
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatMini label="کل افراد" value={rows.length} />
        <StatMini
          label="ساکن"
          value={rows.filter((r) => (r.roles || []).includes('ساکن') || r.kind === 'resident').length}
        />
        <StatMini
          label="مدیر/هیئت"
          value={rows.filter((r) => r.kind === 'block_manager' || r.kind === 'board' || r.kind === 'multi').length}
        />
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-700" />
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو: نام، سمت، واحد، بلوک، تلفن..."
        />
      </div>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="sheet-frame overflow-hidden">
        <div className="sheet-titlebar">
          <span>جدول افراد</span>
          <span className="text-[11px]">{filtered.length.toLocaleString('fa-IR')} نفر</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-sky-800 font-semibold text-sm">موردی یافت نشد</div>
        ) : (
          <div className="overflow-x-auto bg-white">
            <table className="sheet-table w-full text-sm">
              <thead>
                <tr>
                  <th className="col-index">#</th>
                  <th>سمت</th>
                  <th>نام و نام خانوادگی</th>
                  <th>زمان ثبت‌نام</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-sky-50 transition-colors"
                    onClick={() => setSelected(r)}
                    title="لمس برای مشاهده اطلاعات"
                  >
                    <td className="col-index">{(idx + 1).toLocaleString('fa-IR')}</td>
                    <td className="cell-name">
                      <span className="font-extrabold text-slate-900 block leading-5">{r.role_label}</span>
                      {r.role_detail && (
                        <span className="text-[11px] font-bold text-sky-800 block mt-0.5 leading-4">
                          {r.role_detail}
                        </span>
                      )}
                    </td>
                    <td className="cell-name font-black text-slate-900">{r.full_name}</td>
                    <td className="cell-name text-xs font-bold text-slate-600 whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] font-bold text-slate-600 leading-6">
        اگر مدیر بلوک یا عضو هیئت مدیره خودش ساکن باشد، سمت او همراه با «ساکن واحد …» در همان ردیف نشان داده
        می‌شود.
      </p>
    </div>
  )
}

function StatMini({ label, value }) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-2 text-center">
      <p className="text-[10px] font-bold text-sky-800">{label}</p>
      <p className="text-sm font-black text-slate-900">{Number(value || 0).toLocaleString('fa-IR')}</p>
    </div>
  )
}

function PersonDetail({ person, onBack }) {
  const p = person
  const fields: Array<{ icon: typeof User; label: string; value: unknown }> = []

  fields.push({ icon: User, label: 'نام و نام خانوادگی', value: p.full_name })
  fields.push({ icon: Briefcase, label: 'سمت', value: p.role_label })
  if (p.title) fields.push({ icon: BadgeCheck, label: 'عنوان هیئت مدیره', value: p.title })
  if (p.responsibility) fields.push({ icon: Briefcase, label: 'مسئولیت', value: p.responsibility })
  if (p.unit_name) fields.push({ icon: Home, label: 'نام واحد', value: p.unit_name })
  if (p.block_number) {
    fields.push({
      icon: Building2,
      label: 'بلوک',
      value: `${p.block_number} ${p.block_direction || ''}`.trim(),
    })
  }
  if (p.floor) fields.push({ icon: Building2, label: 'طبقه', value: p.floor })
  if (p.occupancy) fields.push({ icon: BadgeCheck, label: 'مالک / مستاجر', value: p.occupancy })
  if (p.people_count != null) {
    fields.push({
      icon: Users,
      label: 'تعداد نفرات',
      value: `${Number(p.people_count).toLocaleString('fa-IR')} نفر`,
    })
  }
  if (p.phone) fields.push({ icon: Phone, label: 'تلفن', value: p.phone })
  fields.push({ icon: CalendarDays, label: 'زمان ثبت‌نام', value: formatDate(p.created_at) })
  if (p.status) fields.push({ icon: BadgeCheck, label: 'وضعیت', value: p.status === 'inactive' ? 'غیرفعال' : p.status === 'blocked' ? 'مسدود' : 'فعال' })

  const permEntries = p.permissions
    ? Object.entries(p.permissions).filter(([, v]) => v)
    : []

  return (
    <div className="space-y-4" dir="rtl">
      <button type="button" onClick={onBack} className="btn-ghost !py-2 inline-flex items-center gap-1.5 text-sm">
        <ArrowRight className="w-4 h-4" />
        بازگشت به جدول افراد
      </button>

      <div className="rounded-2xl border-2 border-sky-300 bg-gradient-to-l from-sky-50 to-white px-4 py-3.5">
        <p className="font-black text-slate-900 text-base">{p.full_name}</p>
        <p className="text-sm font-bold text-slate-600 mt-1">{p.role_label}</p>
        {p.role_detail && (
          <p className="text-xs font-semibold text-slate-600 mt-1">{p.role_detail}</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        {fields.map((f) => {
          const Icon = f.icon
          return (
            <div
              key={f.label}
              className="rounded-xl border border-sky-200 bg-white px-3.5 py-3"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-800 mb-1">
                <Icon className="w-3.5 h-3.5 text-indigo-600" />
                {f.label}
              </div>
              <p className="font-extrabold text-slate-900 text-sm break-all">{String(f.value || '—')}</p>
            </div>
          )
        })}
      </div>

      {permEntries.length > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-3.5 space-y-2">
          <p className="text-xs font-black text-indigo-950">دسترسی‌های هیئت مدیره</p>
          <div className="flex flex-wrap gap-1.5">
            {permEntries.map(([k]) => (
              <span
                key={k}
                className="text-[10px] font-bold rounded-full bg-white border border-indigo-100 text-indigo-900 px-2 py-0.5"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}

      {(p.roles || []).length > 1 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-950">
          نقش‌های هم‌زمان: {(p.roles || []).join(' · ')}
        </div>
      )}
    </div>
  )
}
