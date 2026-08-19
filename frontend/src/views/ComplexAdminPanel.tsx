'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '../lib/nav'
import {
  Building2,
  Users,
  ClipboardList,
  Wallet,
  MessageSquare,
  MessagesSquare,
  Landmark,
  Shield,
  List,
  ArrowLeftRight,
  FileSpreadsheet,
  Table2,
  Receipt,
  FileCheck2,
  ArrowRight,
  UsersRound,
  Wrench,
  Images,
} from 'lucide-react'
import { clearSession, getSession, saveSession } from '../lib/session'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import {
  fetchMessageCounts,
  markTabsRead,
  sumTabCounts,
  COMPLEX_TAB_KEYS,
} from '../lib/messages'
import ManagerShell from '../components/ManagerShell'
import SlideDropdownMenu from '../components/SlideDropdownMenu'
import BlockLayerWorkspace from '../components/BlockLayerWorkspace'
import StaffChat from '../components/StaffChat'
import ManagerBillsTools from '../components/ManagerBillsTools'
import ManagerPrivateInbox from '../components/ManagerPrivateInbox'
import PublicChat from '../components/PublicChat'
import ComplexFinanceBlocks from '../components/ComplexFinanceBlocks'
import ComplexMonthlyCharge from '../components/ComplexMonthlyCharge'
import ComplexBoardManager from '../components/ComplexBoardManager'
import BoardWorkOrders from '../components/BoardWorkOrders'
import ComplexPeopleDirectory from '../components/ComplexPeopleDirectory'
import ManagerUploads from '../components/ManagerUploads'
import { BreadcrumbBar, EntityCard } from '../components/ManagerUiBits'

const STATUSES = ['دریافت شده', 'در حال بررسی', 'تایید شده', 'تایید نشده']
const STATUS_STYLE = {
  'دریافت شده': 'status-received',
  'در حال بررسی': 'status-review',
  'تایید شده': 'status-approved',
  'تایید نشده': 'status-rejected',
}

function blockKey(b) {
  const n = onlyDigits(b.block_number) || toEnglishDigits(b.block_number || '')
  return `${n}|${b.block_direction || ''}`
}

export default function ComplexAdminPanel() {
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(null)
  const [requests, setRequests] = useState<any[]>([])
  const [residents, setResidents] = useState<any[]>([])
  const [blockManagers, setBlockManagers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [counts, setCounts] = useState({})

  const [openMenuId, setOpenMenuId] = useState(null)
  const [activeSection, setActiveSection] = useState('blocks_section')
  const [subTab, setSubTab] = useState('blocks_list')
  // drill-down
  const [selectedBlock, setSelectedBlock] = useState(null)

  // default finance tab id used in menu
  // finance_blocks = جدول مالی بلوک‌ها

  const audienceKey = admin?.complex_name || ''

  const sections = useMemo(
    () => [
      {
        id: 'blocks_section',
        label: 'مدیر بلوک‌ها',
        icon: Building2,
        subs: [
          { id: 'blocks_list', label: 'لیست بلوک‌ها', desc: 'ورود به لایه هر بلوک', icon: List },
          { id: 'block_chat', label: 'ارتباط با مدیر بلوک', desc: 'گفتگوی خصوصی سلسله‌مراتبی', icon: MessageSquare },
        ],
      },
      {
        id: 'residents_section',
        label: 'ساکنین',
        icon: Users,
        subs: [
          { id: 'requests', label: 'درخواست عضویت', desc: 'تایید واحدها', icon: ClipboardList },
          { id: 'residents_all', label: 'همه ساکنین', desc: 'نمای مجتمع', icon: Users },
          { id: 'public_chat', label: 'چت عمومی نمونه', desc: 'مشاهده فضای عمومی', icon: MessagesSquare },
        ],
      },
      {
        id: 'finance_section',
        label: 'امور مالی',
        icon: Wallet,
        subs: [
          {
            id: 'finance_blocks',
            label: 'وضعیت مالی بلوک‌ها',
            desc: 'هر بلوک یک ردیف — پرداخت و بدهی',
            icon: Wallet,
          },
          {
            id: 'bills_overview',
            label: 'صدور و دریافت شارژ',
            desc: 'شارژ ماهیانه برای همه ساکنین',
            icon: Receipt,
          },
        ],
      },
      {
        id: 'board_section',
        label: 'هیئت مدیره',
        icon: UsersRound,
        subs: [
          {
            id: 'board_members',
            label: 'اعضا و دسترسی‌ها',
            desc: 'ثبت سمت، مسئولیت و گزینه‌های ارتباطی',
            icon: UsersRound,
          },
          {
            id: 'board_work_orders',
            label: 'درخواست‌های کار/تعمیر',
            desc: 'نظارت بر ارجاع به تأسیسات و …',
            icon: Wrench,
          },
        ],
      },
      {
        id: 'comms_section',
        label: 'ارتباطات',
        icon: Landmark,
        subs: [
          { id: 'system_chat', label: 'ارتباط با مدیر سیستم', desc: 'گفتگوی خصوصی بالادست', icon: Shield },
        ],
      },
      {
        id: 'io_section',
        label: 'خروجی و ورودی',
        icon: ArrowLeftRight,
        subs: [
          {
            id: 'people_directory',
            label: 'فهرست افراد مجتمع',
            desc: 'ساکن، مدیر بلوک، هیئت مدیره',
            icon: Users,
          },
          { id: 'io_hint', label: 'اکسل و جدول واحدها', desc: 'از لایه هر بلوک', icon: FileSpreadsheet },
          {
            id: 'uploads_browser',
            label: 'فایل‌های آپلود شده',
            desc: 'رسید، فاکتور و صوت همه بلوک‌ها — نگهداری ۶۰ روز',
            icon: Images,
          },
        ],
      },
    ],
    [],
  )

  const refreshCounts = useCallback(async () => {
    if (!audienceKey) return
    try {
      const data = await fetchMessageCounts('complex_manager', [audienceKey, 'all'])
      setCounts(data.counts || {})
    } catch {
      /* ignore */
    }
  }, [audienceKey])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch('/api/membership-requests'),
        fetch('/api/residents'),
        fetch('/api/auth-block-manager'),
      ])
      const d1 = await r1.json()
      const d2 = await r2.json()
      const d3 = await r3.json()
      if (!r1.ok) throw new Error(d1.error || 'خطا در درخواست‌ها')
      if (!r2.ok) throw new Error(d2.error || 'خطا در ساکنین')
      setRequests(Array.isArray(d1) ? d1 : [])
      setResidents(Array.isArray(d2) ? d2 : [])

      let blocks = r3.ok && Array.isArray(d3) ? d3 : []
      if (!blocks.length) {
        const map = new Map()
        for (const r of Array.isArray(d2) ? d2 : []) {
          const k = `${toEnglishDigits(r.block_number)}|${r.block_direction}`
          if (!map.has(k)) {
            map.set(k, {
              id: k,
              block_number: r.block_number,
              block_direction: r.block_direction,
              full_name: `مدیر بلوک ${r.block_number} ${r.block_direction}`,
            })
          }
        }
        blocks = Array.from(map.values())
      }
      setBlockManagers(blocks)
    } catch (err) {
      setError(err.message || 'خطا در بارگذاری')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const session = getSession()
    if (!session || session.type !== 'admin' || session.admin?.role !== 'complex_manager') {
      navigate('/', { replace: true })
      return
    }
    setAdmin(session.admin)
    loadData()
  }, [navigate, loadData])

  useEffect(() => {
    if (!audienceKey) return
    refreshCounts()
    const t = setInterval(refreshCounts, 12000)
    return () => clearInterval(t)
  }, [audienceKey, refreshCounts])

  const openSub = async (sectionId, subId) => {
    setActiveSection(sectionId)
    setSubTab(subId)
    setOpenMenuId(null)
    if (subId !== 'block_workspace') setSelectedBlock(null)
    const tabKeys = COMPLEX_TAB_KEYS[subId] || COMPLEX_TAB_KEYS[sectionId] || []
    if (tabKeys.length && audienceKey) {
      try {
        await markTabsRead('complex_manager', [audienceKey, 'all'], tabKeys)
        await refreshCounts()
      } catch {
        /* ignore */
      }
    }
  }

  const enterBlock = (b) => {
    setSelectedBlock(b)
    setActiveSection('blocks_section')
    setSubTab('block_workspace')
    setOpenMenuId(null)
  }

  const updateStatus = async (id, status) => {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch('/api/membership-requests', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'به‌روزرسانی ناموفق')
      await loadData()
      await refreshCounts()
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

  const residentsByBlock = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of residents) {
      const k = `${toEnglishDigits(r.block_number)}|${r.block_direction}`
      m[k] = (m[k] || 0) + 1
    }
    return m
  }, [residents])

  const [chatBlock, setChatBlock] = useState(null)

  if (!admin) {
    return (
      <div className="min-h-screen flex items-center justify-center panel-page" dir="rtl">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const breadcrumb: Array<{ label: string }> = []
  breadcrumb.push({ label: admin.complex_name || 'مجتمع' })
  if (selectedBlock) {
    breadcrumb.push({
      label: `بلوک ${selectedBlock.block_number} ${selectedBlock.block_direction}`,
    })
  }

  return (
    <ManagerShell
      title="پنل مدیر مجتمع"
      subtitle={`${admin.full_name || admin.complex_name} — نظارت بر مدیران بلوک`}
      icon={Building2}
      designKey="block7_complex_admin_design_v3"
      helpTitle="راهنمای مدیر مجتمع"
      helpItems={[
        {
          title: 'سلسله‌مراتب',
          body: 'مدیر سیستم ← مدیر مجتمع ← مدیر بلوک ← ساکن. شما روی همه مدیران بلوک نظارت دارید و با لمس هر بلوک وارد لایه زیرین می‌شوید.',
        },
        {
          title: 'ساکنین / مالی / ارتباط',
          body: 'همان تب‌های مدیر بلوک داخل هر بلوک در دسترس است. ارتباط خصوصی: ساکن↔بلوک، بلوک↔مجتمع، مجتمع↔سیستم.',
        },
        {
          title: 'صدور و دریافت شارژ',
          body: 'در امور مالی می‌توانید شارژ ماهیانه بلوک را برای همه ساکنین (یا بلوک‌های انتخابی) صادر کنید؛ مثل قبض در پنل ساکن ظاهر می‌شود تا رسید بفرستد.',
        },
        {
          title: 'هیئت مدیره',
          body: 'اعضا را با سمت (مالی، تأسیسات، برقکار و …) ثبت کنید و دسترسی ارتباط/مالی/تعمیر را تیک بزنید. مدیران بلوک می‌توانند برای مسئول تأسیسات درخواست تعمیر بفرستند.',
        },
      ]}
      onLogout={logout}
      passwordApi={{
        url: '/api/auth-complex-manager',
        bodyFromForm: (f) => ({
          id: admin.id,
          complex_name: admin.complex_name,
          ...f,
        }),
        onSuccess: (data) => {
          if (data.admin) {
            const session = getSession()
            if (session?.type === 'admin') {
              saveSession({
                ...session,
                admin: { ...session.admin, ...data.admin, role: 'complex_manager' },
              })
              setAdmin((p) => ({ ...(p || {}), ...data.admin, role: 'complex_manager' }))
            }
          }
        },
      }}
      topExtra={
        <BreadcrumbBar
          items={breadcrumb}
          onHome={() => {
            setSelectedBlock(null)
            setSubTab('blocks_list')
            setActiveSection('blocks_section')
          }}
        />
      }
    >
      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <span>{error}</span>
        </div>
      )}

      <div className="complex-overview-stats">
        <MiniStat label="بلوک‌ها" value={blockManagers.length} />
        <MiniStat label="ساکنین" value={residents.length} />
        <MiniStat
          label="درخواست"
          value={requests.filter((r) => r.status === 'دریافت شده' || r.status === 'در حال بررسی').length}
        />
        <MiniStat
          label="پیام‌ها"
          value={sumTabCounts(counts, ['messages', 'private_chat', 'system_chat'])}
        />
      </div>

      <SlideDropdownMenu
        sections={sections}
        openId={openMenuId}
        activeSubId={subTab}
        onToggle={(id) => setOpenMenuId((p) => (p === id ? null : id))}
        onSelectSub={(sectionId, subId) => openSub(sectionId, subId)}
        getSectionBadge={() => 0}
        getSubBadge={(sub) => sumTabCounts(counts, COMPLEX_TAB_KEYS[sub.id] || [])}
      />

      <div className="bm-main-panel">
        {/* drill into block */}
        {subTab === 'block_workspace' && selectedBlock && (
          <div className="space-y-3">
            <button
              type="button"
              className="btn-ghost !py-2 inline-flex items-center gap-1 text-sm"
              onClick={() => {
                setSelectedBlock(null)
                setSubTab('blocks_list')
              }}
            >
              <ArrowRight className="w-4 h-4" />
              بازگشت به لیست بلوک‌ها
            </button>
            <BlockLayerWorkspace
              blockAdmin={selectedBlock}
              viewerRole="complex_manager"
              viewerName={admin.full_name || admin.complex_name}
            />
          </div>
        )}

        {subTab === 'blocks_list' && (
          <div className="space-y-3">
            <h2 className="panel-title text-lg">مدیران / بلوک‌های زیرمجموعه</h2>
            <p className="text-sm font-semibold text-slate-600">
              با لمس هر بلوک وارد همان امکانات مدیر بلوک (ساکنین، مالی، ارتباط، اکسل) می‌شوید.
            </p>
            {loading ? (
              <Loader />
            ) : blockManagers.length === 0 ? (
              <Empty text="بلوکی ثبت نشده است" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {blockManagers.map((b) => {
                  const k = `${toEnglishDigits(b.block_number)}|${b.block_direction}`
                  return (
                    <EntityCard
                      key={b.id || k}
                      icon={Building2}
                      title={`بلوک ${b.block_number} ${b.block_direction}`}
                      subtitle={b.full_name || 'مدیر بلوک'}
                      meta={`${(residentsByBlock[k] || 0).toLocaleString('fa-IR')} ساکن`}
                      badge="ورود"
                      onClick={() => enterBlock(b)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}

        {subTab === 'block_chat' && (
          <div className="space-y-3">
            <label className="block max-w-md">
              <span className="field-label text-xs mb-1.5 block">انتخاب مدیر بلوک برای گفتگو</span>
              <select
                className="field-input"
                value={chatBlock ? blockKey(chatBlock) : ''}
                onChange={(e) => {
                  const b = blockManagers.find((x) => blockKey(x) === e.target.value)
                  setChatBlock(b || null)
                }}
              >
                <option value="">انتخاب بلوک</option>
                {blockManagers.map((b) => (
                  <option key={b.id || blockKey(b)} value={blockKey(b)}>
                    بلوک {b.block_number} {b.block_direction} — {b.full_name || ''}
                  </option>
                ))}
              </select>
            </label>
            {chatBlock ? (
              <StaffChat
                block_number={chatBlock.block_number}
                block_direction={chatBlock.block_direction}
                sender_role="complex_manager"
                sender_name={admin.full_name || admin.complex_name || 'مدیر مجتمع'}
                title={`گفتگو با مدیر بلوک ${chatBlock.block_number} ${chatBlock.block_direction}`}
              />
            ) : (
              <Empty text="یک بلوک را برای گفتگوی خصوصی انتخاب کنید" />
            )}
          </div>
        )}

        {subTab === 'system_chat' && (
          <StaffChat
            channel="system_complex"
            complex_name={admin.complex_name}
            sender_role="complex_manager"
            sender_name={admin.full_name || admin.complex_name || 'مدیر مجتمع'}
            title="ارتباط خصوصی با مدیر سیستم"
          />
        )}

        {subTab === 'requests' && (
          <div className="table-wrap">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="font-extrabold text-slate-900">درخواست‌های عضویت واحدها</h2>
            </div>
            {loading ? (
              <Loader />
            ) : requests.length === 0 ? (
              <Empty text="درخواستی نیست" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right">
                      <th className="px-4 py-3 font-bold">نام</th>
                      <th className="px-4 py-3 font-bold">واحد / بلوک</th>
                      <th className="px-4 py-3 font-bold">نفرات</th>
                      <th className="px-4 py-3 font-bold">تاریخ</th>
                      <th className="px-4 py-3 font-bold">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
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
                          <div className="flex flex-col gap-1.5 min-w-[140px]">
                            <span className={`status-badge ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span>
                            <select
                              value={r.status}
                              disabled={busyId === r.id}
                              onChange={(e) => updateStatus(r.id, e.target.value)}
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

        {subTab === 'residents_all' && (
          <div className="space-y-3">
            <h2 className="panel-title text-lg">ساکنین کل مجتمع</h2>
            <p className="text-xs font-bold text-slate-500">برای مدیریت کامل هر واحد، وارد لایه بلوک مربوطه شوید.</p>
            {loading ? (
              <Loader />
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {residents.map((r) => (
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
                    <p className="font-black text-slate-900 text-sm">
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
            )}
          </div>
        )}

        {subTab === 'public_chat' && (
          <PublicChat
            user={{
              unit_name: `مجتمع-${admin.complex_name || 'x'}`,
              first_name: admin.full_name || 'مدیر',
              last_name: 'مجتمع',
              block_number: blockManagers[0]?.block_number || '۷',
              block_direction: blockManagers[0]?.block_direction || 'شرقی',
            }}
          />
        )}

        {subTab === 'finance_blocks' && (
          <ComplexFinanceBlocks
            admin={admin}
            blockManagers={blockManagers}
            residents={residents}
            onEnterBlock={(bm) => {
              setSelectedBlock(bm)
            }}
          />
        )}

        {subTab === 'bills_overview' && (
          <ComplexMonthlyCharge
            admin={admin}
            blockManagers={blockManagers}
            residents={residents}
            onChanged={refreshCounts}
          />
        )}

        {subTab === 'board_members' && (
          <ComplexBoardManager admin={admin} onChanged={refreshCounts} />
        )}

        {subTab === 'board_work_orders' && (
          <BoardWorkOrders
            mode="overview"
            complexName={admin.complex_name}
            actorName={admin.full_name || admin.complex_name}
            actorRole="complex_manager"
          />
        )}

        {subTab === 'people_directory' && (
          <ComplexPeopleDirectory
            admin={admin}
            residents={residents}
            blockManagers={blockManagers}
          />
        )}

        {subTab === 'io_hint' && (
          <Empty text="جدول واحدها، ورود/خروجی اکسل و پشتیبان در لایه هر بلوک (مشابه مدیر بلوک) در دسترس است." />
        )}
        {subTab === 'uploads_browser' && <ManagerUploads admin={admin} scope="all" />}
      </div>
    </ManagerShell>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="complex-overview-stat">
      <div className="complex-overview-stat-label">{label}</div>
      <p className="complex-overview-stat-value">
        {Number(value || 0).toLocaleString('fa-IR')}
      </p>
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
  return <div className="text-center py-12 text-slate-500 font-semibold text-sm">{text}</div>
}
