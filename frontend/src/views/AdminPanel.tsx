'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '../lib/nav'
import {
  Shield,
  Building2,
  Users,
  ClipboardList,
  Wallet,
  MessageSquare,
  Landmark,
  List,
  ArrowLeftRight,
  FileSpreadsheet,
  ArrowRight,
  Receipt,
  CloudUpload,
  BookOpen,
  Images,
} from 'lucide-react'
import { clearSession, getSession, saveSession } from '../lib/session'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import {
  fetchMessageCounts,
  markTabsRead,
  sumTabCounts,
  SYSTEM_TAB_KEYS,
} from '../lib/messages'
import ManagerShell from '../components/ManagerShell'
import SlideDropdownMenu from '../components/SlideDropdownMenu'
import BlockLayerWorkspace from '../components/BlockLayerWorkspace'
import StaffChat from '../components/StaffChat'
import CloudTransferGuide from '../components/CloudTransferGuide'
import ManagerUploads from '../components/ManagerUploads'
import { BreadcrumbBar, EntityCard } from '../components/ManagerUiBits'

const STATUSES = ['دریافت شده', 'در حال بررسی', 'تایید شده', 'تایید نشده']
const STATUS_STYLE = {
  'دریافت شده': 'status-received',
  'در حال بررسی': 'status-review',
  'تایید شده': 'status-approved',
  'تایید نشده': 'status-rejected',
}

export default function AdminPanel() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [complexes, setComplexes] = useState<any[]>([])
  const [blockManagers, setBlockManagers] = useState<any[]>([])
  const [residents, setResidents] = useState<any[]>([])
  const [complexRequests, setComplexRequests] = useState<any[]>([])
  const [membershipRequests, setMembershipRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [counts, setCounts] = useState({})
  const [search, setSearch] = useState('')

  const [openMenuId, setOpenMenuId] = useState(null)
  const [activeSection, setActiveSection] = useState('complex_section')
  const [subTab, setSubTab] = useState('complexes_list')

  // hierarchy drill: null | {type:'complex', data} | {type:'block', data, complex}
  const [layer, setLayer] = useState(null)
  const [chatComplex, setChatComplex] = useState('')

  const sections = useMemo(
    () => [
      {
        id: 'complex_section',
        label: 'مجتمع‌ها',
        icon: Building2,
        subs: [
          { id: 'complexes_list', label: 'لیست مجتمع‌ها', desc: 'ورود به لایه مدیر مجتمع', icon: List },
          { id: 'complex_requests', label: 'درخواست مجتمع', desc: 'تایید مدیران مجتمع', icon: ClipboardList },
          { id: 'complex_chat', label: 'ارتباط با مدیر مجتمع', desc: 'گفتگوی خصوصی بالادست', icon: MessageSquare },
        ],
      },
      {
        id: 'residents_section',
        label: 'ساکنین',
        icon: Users,
        subs: [
          { id: 'membership', label: 'عضویت واحد', desc: 'نظارت درخواست‌ها', icon: ClipboardList },
          { id: 'residents', label: 'همه ساکنین', desc: 'نمای سراسری', icon: Users },
        ],
      },
      {
        id: 'finance_section',
        label: 'امور مالی',
        icon: Wallet,
        subs: [
          {
            id: 'finance_overview',
            label: 'نظارت مالی',
            desc: 'از طریق ورود به مجتمع → بلوک',
            icon: Receipt,
          },
        ],
      },
      {
        id: 'io_section',
        label: 'خروجی و ورودی',
        icon: ArrowLeftRight,
        subs: [
          {
            id: 'io_hint',
            label: 'اکسل و پشتیبان',
            desc: 'در لایه هر بلوک',
            icon: FileSpreadsheet,
          },
          {
            id: 'uploads_browser',
            label: 'فایل‌های آپلود شده',
            desc: 'رسید، فاکتور و صوت — نگهداری ۶۰ روز',
            icon: Images,
          },
          {
            id: 'cloud_transfer_guide',
            label: 'ابر خصوصی و انتقال برنامه',
            desc: 'فایل پشتیبان + اجرای شخصی',
            icon: CloudUpload,
          },
        ],
      },
      {
        id: 'guides_section',
        label: 'راهنماها',
        icon: BookOpen,
        subs: [
          {
            id: 'cloud_transfer_guide',
            label: 'ابر خصوصی و انتقال کل برنامه',
            desc: 'بکاپ فایل + مهاجرت و اجرا روی سرور خودتان',
            icon: CloudUpload,
          },
        ],
      },
    ],
    [],
  )

  const refreshCounts = useCallback(async () => {
    try {
      const data = await fetchMessageCounts('system_admin', 'system')
      setCounts(data.counts || {})
    } catch {
      /* ignore */
    }
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cRes, bRes, rRes, crRes, mrRes] = await Promise.all([
        fetch('/api/complex-managers'),
        fetch('/api/auth-block-manager'),
        fetch('/api/residents'),
        fetch('/api/complex-requests'),
        fetch('/api/membership-requests'),
      ])
      const c = await cRes.json()
      const b = await bRes.json()
      const r = await rRes.json()
      const cr = await crRes.json()
      const mr = await mrRes.json()
      if (!cRes.ok) throw new Error(c.error || 'خطا در مجتمع‌ها')
      if (!bRes.ok) throw new Error(b.error || 'خطا در مدیران بلوک')
      if (!rRes.ok) throw new Error(r.error || 'خطا در ساکنین')
      if (!crRes.ok) throw new Error(cr.error || 'خطا در درخواست مجتمع')
      if (!mrRes.ok) throw new Error(mr.error || 'خطا در عضویت')
      setComplexes(Array.isArray(c) ? c : c.complexes || [])
      setBlockManagers(Array.isArray(b) ? b : [])
      setResidents(Array.isArray(r) ? r : [])
      setComplexRequests(Array.isArray(cr) ? cr : [])
      setMembershipRequests(Array.isArray(mr) ? mr : [])
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const session = getSession()
    if (!session || session.type !== 'admin') {
      navigate('/', { replace: true })
      return
    }
    if (session.admin?.role === 'block_manager') {
      navigate('/block-admin', { replace: true })
      return
    }
    if (session.admin?.role === 'complex_manager') {
      navigate('/complex-admin', { replace: true })
      return
    }
    if (session.admin?.role !== 'system_admin') {
      navigate('/', { replace: true })
      return
    }
    setAdmin(session.admin)
    loadAll()
    refreshCounts()
    const t = setInterval(refreshCounts, 20000)
    return () => clearInterval(t)
  }, [navigate, loadAll, refreshCounts])

  const openSub = async (sectionId, subId) => {
    setActiveSection(sectionId)
    setSubTab(subId)
    setOpenMenuId(null)
    if (subId !== 'complex_workspace' && subId !== 'block_workspace') {
      // keep layer only for workspace tabs
      if (subId === 'complexes_list') setLayer(null)
    }
    const tabKeys = SYSTEM_TAB_KEYS[subId] || []
    if (tabKeys.length) {
      try {
        await markTabsRead('system_admin', ['system'], tabKeys)
        await refreshCounts()
      } catch {
        /* ignore */
      }
    }
  }

  const enterComplex = (c) => {
    setLayer({ type: 'complex', data: c })
    setSubTab('complex_workspace')
    setActiveSection('complex_section')
    setOpenMenuId(null)
  }

  const enterBlock = (b, complex = null) => {
    setLayer({ type: 'block', data: b, complex: complex || layer?.data || null })
    setSubTab('block_workspace')
    setActiveSection('complex_section')
    setOpenMenuId(null)
  }

  const updateComplexStatus = async (id, status) => {
    setBusyId(`c-${id}`)
    try {
      const res = await fetch('/api/complex-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا')
      await loadAll()
      await refreshCounts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const updateMembershipStatus = async (id, status) => {
    setBusyId(`m-${id}`)
    try {
      const res = await fetch('/api/membership-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا')
      await loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const logout = () => {
    clearSession()
    navigate('/')
  }

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

  const blocksOfComplex = useMemo(() => blockManagers, [blockManagers])

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return residents
    return residents.filter((r) =>
      [r.unit_name, r.first_name, r.last_name, r.phone, r.block_number, r.block_direction]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [residents, search])

  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center panel-page" dir="rtl">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const crumbs: Array<{ label: string; onClick?: () => void }> = [{ label: 'مدیر سیستم' }]
  if (layer?.type === 'complex' || layer?.complex) {
    const c = layer.type === 'complex' ? layer.data : layer.complex
    crumbs.push({
      label: c?.complex_name || 'مجتمع',
      onClick:
        layer.type === 'block'
          ? () => {
              setLayer({ type: 'complex', data: c })
              setSubTab('complex_workspace')
            }
          : undefined,
    })
  }
  if (layer?.type === 'block') {
    crumbs.push({
      label: `بلوک ${layer.data.block_number} ${layer.data.block_direction}`,
    })
  }

  return (
    <ManagerShell
      title="پنل مدیر سیستم"
      subtitle={`${admin.full_name || admin.username} — نظارت بر مدیران مجتمع و بلوک`}
      icon={Shield}
      designKey="block7_system_admin_design_v3"
      helpTitle="راهنمای مدیر سیستم"
      helpItems={[
        {
          title: 'سلسله‌مراتب',
          body: 'مدیر سیستم (بالادست) ← مدیر مجتمع ← مدیر بلوک ← ساکن. با لمس هر مجتمع وارد لایه مدیر مجتمع می‌شوید، سپس با لمس هر بلوک وارد امکانات همان بلوک.',
        },
        {
          title: 'ارتباط خصوصی',
          body: 'ساکن ↔ مدیر بلوک | مدیر بلوک ↔ مدیر مجتمع | مدیر مجتمع ↔ مدیر سیستم',
        },
        {
          title: 'مالی و اکسل',
          body: 'همه تب‌های مدیر بلوک در لایه بلوک در دسترس است.',
        },
        {
          title: 'ابر خصوصی',
          body: 'از منوی «راهنماها» یا «خروجی و ورودی» تب راهنمای انتقال فایل به فضای ابری خصوصی را باز کنید (سرویس‌های ایرانی و خارجی).',
        },
      ]}
      onLogout={logout}
      passwordApi={{
        url: '/api/auth-admin',
        bodyFromForm: (f) => ({
          id: admin.id,
          username: admin.username,
          ...f,
        }),
        onSuccess: (data) => {
          if (data.admin) {
            const session = getSession()
            if (session?.type === 'admin') {
              saveSession({
                ...session,
                admin: { ...session.admin, ...data.admin },
              })
              setAdmin((p) => ({ ...(p || {}), ...data.admin }))
            }
          }
        },
      }}
      topExtra={
        <BreadcrumbBar
          items={crumbs}
          onHome={() => {
            setLayer(null)
            setSubTab('complexes_list')
            setActiveSection('complex_section')
          }}
        />
      }
    >
      {error && <div className="msg-error rounded-xl px-4 py-3 text-sm font-semibold">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="مجتمع‌ها" value={complexes.length} />
        <MiniStat label="بلوک‌ها" value={blockManagers.length} />
        <MiniStat label="ساکنین" value={residents.length} />
        <MiniStat
          label="درخواست مجتمع باز"
          value={complexRequests.filter((r) => r.status === 'دریافت شده' || r.status === 'در حال بررسی').length}
        />
      </div>

      <SlideDropdownMenu
        sections={sections}
        openId={openMenuId}
        activeSubId={subTab}
        onToggle={(id) => setOpenMenuId((p) => (p === id ? null : id))}
        onSelectSub={(sectionId, subId) => openSub(sectionId, subId)}
        getSectionBadge={() => 0}
        getSubBadge={(sub) => sumTabCounts(counts, SYSTEM_TAB_KEYS[sub.id] || [])}
      />

      <div className="bm-main-panel">
        {/* Layer: complex */}
        {subTab === 'complex_workspace' && layer?.type === 'complex' && (
          <div className="space-y-4">
            <button
              type="button"
              className="btn-ghost !py-2 inline-flex items-center gap-1 text-sm"
              onClick={() => {
                setLayer(null)
                setSubTab('complexes_list')
              }}
            >
              <ArrowRight className="w-4 h-4" />
              بازگشت به لیست مجتمع‌ها
            </button>

            <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3">
              <p className="font-black text-violet-950 text-sm">لایه مدیر مجتمع: {layer.data.complex_name}</p>
              <p className="text-xs font-bold text-violet-800 mt-1">
                {layer.data.full_name || '—'} — {layer.data.blocks_count || '—'} بلوک /{' '}
                {layer.data.units_count || '—'} واحد
              </p>
              <p className="text-[11px] font-semibold text-violet-700 mt-1">{layer.data.address}</p>
            </div>

            <h3 className="font-black text-slate-900 text-sm">مدیران بلوک این مجتمع — لمس برای ورود</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {blocksOfComplex.map((b) => (
                <EntityCard
                  key={b.id || `${b.block_number}-${b.block_direction}`}
                  icon={Building2}
                  title={`بلوک ${b.block_number} ${b.block_direction}`}
                  subtitle={b.full_name || 'مدیر بلوک'}
                  meta={`${residents
                    .filter(
                      (r) =>
                        (onlyDigits(r.block_number) || toEnglishDigits(r.block_number)) ===
                          (onlyDigits(b.block_number) || toEnglishDigits(b.block_number)) &&
                        r.block_direction === b.block_direction,
                    )
                    .length.toLocaleString('fa-IR')} ساکن`}
                  badge="ورود"
                  onClick={() => enterBlock(b, layer.data)}
                />
              ))}
            </div>

            <StaffChat
              channel="system_complex"
              complex_name={layer.data.complex_name}
              sender_role="system_admin"
              sender_name={admin.full_name || admin.username || 'مدیر سیستم'}
              title={`گفتگو با مدیر مجتمع ${layer.data.complex_name}`}
            />
          </div>
        )}

        {/* Layer: block */}
        {subTab === 'block_workspace' && layer?.type === 'block' && (
          <div className="space-y-3">
            <button
              type="button"
              className="btn-ghost !py-2 inline-flex items-center gap-1 text-sm"
              onClick={() => {
                if (layer.complex) {
                  setLayer({ type: 'complex', data: layer.complex })
                  setSubTab('complex_workspace')
                } else {
                  setLayer(null)
                  setSubTab('complexes_list')
                }
              }}
            >
              <ArrowRight className="w-4 h-4" />
              بازگشت به لایه مجتمع
            </button>
            <BlockLayerWorkspace
              blockAdmin={layer.data}
              viewerRole="system_admin"
              viewerName={admin.full_name || admin.username}
            />
          </div>
        )}

        {subTab === 'complexes_list' && (
          <div className="space-y-3">
            <h2 className="panel-title text-lg">مجتمع‌ها (لایه مدیر مجتمع)</h2>
            <p className="text-sm font-semibold text-slate-600">
              با لمس هر مجتمع وارد لایه مدیر آن می‌شوید و می‌توانید مدیران بلوک و سپس ساکنین را ببینید.
            </p>
            {loading ? (
              <Loader />
            ) : complexes.length === 0 ? (
              <Empty text="مجتمعی ثبت نشده — از درخواست مجتمع تایید کنید" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {complexes.map((c) => (
                  <EntityCard
                    key={c.id}
                    icon={Landmark}
                    title={c.complex_name}
                    subtitle={c.full_name || 'مدیر مجتمع'}
                    meta={`${c.blocks_count || '—'} بلوک · ${c.units_count || '—'} واحد`}
                    badge="ورود"
                    onClick={() => enterComplex(c)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {subTab === 'complex_chat' && (
          <div className="space-y-3">
            <label className="block max-w-md">
              <span className="field-label text-xs mb-1.5 block">انتخاب مدیر مجتمع</span>
              <select
                className="field-input"
                value={chatComplex}
                onChange={(e) => setChatComplex(e.target.value)}
              >
                <option value="">انتخاب مجتمع</option>
                {complexes.map((c) => (
                  <option key={c.id} value={c.complex_name}>
                    {c.complex_name} — {c.full_name || ''}
                  </option>
                ))}
              </select>
            </label>
            {chatComplex ? (
              <StaffChat
                channel="system_complex"
                complex_name={chatComplex}
                sender_role="system_admin"
                sender_name={admin.full_name || admin.username || 'مدیر سیستم'}
                title={`گفتگو با مدیر مجتمع ${chatComplex}`}
              />
            ) : (
              <Empty text="یک مجتمع را برای گفتگو انتخاب کنید" />
            )}
          </div>
        )}

        {subTab === 'complex_requests' && (
          <div className="table-wrap">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-900">
              درخواست‌های مدیر مجتمع
            </div>
            {loading ? (
              <Loader />
            ) : complexRequests.length === 0 ? (
              <Empty text="درخواستی نیست" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right">
                      <th className="px-4 py-3 font-bold">نام مجتمع</th>
                      <th className="px-4 py-3 font-bold">درخواست‌کننده</th>
                      <th className="px-4 py-3 font-bold">بلوک/واحد</th>
                      <th className="px-4 py-3 font-bold">تاریخ</th>
                      <th className="px-4 py-3 font-bold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complexRequests.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-extrabold">{r.complex_name}</td>
                        <td className="px-4 py-3 font-semibold">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {r.blocks_count} / {r.units_count}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5 min-w-[140px]">
                            <span className={`status-badge ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                            <select
                              value={r.status}
                              disabled={busyId === `c-${r.id}`}
                              onChange={(e) => updateComplexStatus(r.id, e.target.value)}
                              className="field-input !py-1.5 !text-xs"
                            >
                              {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {subTab === 'membership' && (
          <div className="table-wrap">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-extrabold text-slate-900">
              درخواست عضویت واحد (نظارتی)
            </div>
            {loading ? (
              <Loader />
            ) : membershipRequests.length === 0 ? (
              <Empty text="درخواستی نیست" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right">
                      <th className="px-4 py-3 font-bold">نام</th>
                      <th className="px-4 py-3 font-bold">واحد</th>
                      <th className="px-4 py-3 font-bold">نفرات</th>
                      <th className="px-4 py-3 font-bold">تاریخ</th>
                      <th className="px-4 py-3 font-bold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membershipRequests.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-extrabold">
                          {r.first_name} {r.last_name}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {r.unit_name}
                          <span className="block text-xs text-indigo-700">
                            بلوک {r.block_number} {r.block_direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {r.people_count != null
                            ? `${Number(r.people_count).toLocaleString('fa-IR')} نفر`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <select
                            value={r.status}
                            disabled={busyId === `m-${r.id}`}
                            onChange={(e) => updateMembershipStatus(r.id, e.target.value)}
                            className="field-input !py-1.5 !text-xs"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {subTab === 'residents' && (
          <div className="space-y-3">
            <input
              className="search-input"
              placeholder="جستجوی ساکن..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid sm:grid-cols-2 gap-2">
              {filteredResidents.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="text-right rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-indigo-400"
                  onClick={() =>
                    enterBlock({
                      block_number: r.block_number,
                      block_direction: r.block_direction,
                      full_name: `مدیر بلوک ${r.block_number} ${r.block_direction}`,
                    })
                  }
                >
                  <p className="font-black text-sm">
                    {r.first_name} {r.last_name}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    واحد {r.unit_name} — بلوک {r.block_number} {r.block_direction}
                    {r.people_count != null
                      ? ` — ${Number(r.people_count).toLocaleString('fa-IR')} نفر`
                      : ''}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {subTab === 'finance_overview' && (
          <Empty text="برای امور مالی کامل: مجتمع را باز کنید → بلوک را لمس کنید → تب امور مالی (ثبت قبض، رسید، وضعیت مالی)." />
        )}
        {subTab === 'io_hint' && (
          <div className="space-y-3">
            <Empty text="جدول واحدها، ورود/خروجی اکسل و پشتیبان در لایه هر بلوک (عین مدیر بلوک) قرار دارد." />
            <button
              type="button"
              className="btn-primary !mt-0 w-full sm:w-auto inline-flex items-center justify-center gap-2"
              onClick={() => openSub('guides_section', 'cloud_transfer_guide')}
            >
              <CloudUpload className="w-4 h-4" />
              باز کردن راهنمای انتقال فایل به ابر خصوصی
            </button>
          </div>
        )}
        {subTab === 'uploads_browser' && <ManagerUploads admin={admin} scope="all" />}
        {subTab === 'cloud_transfer_guide' && <CloudTransferGuide />}
      </div>
    </ManagerShell>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-label mb-1">{label}</div>
      <p className="stat-value">{Number(value || 0).toLocaleString('fa-IR')}</p>
    </div>
  )
}
function Loader() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
function Empty({ text }) {
  return <div className="text-center py-12 text-slate-500 font-semibold text-sm px-4">{text}</div>
}
