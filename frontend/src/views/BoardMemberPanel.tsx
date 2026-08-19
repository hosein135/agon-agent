'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '../lib/nav'
import {
  UsersRound,
  Wallet,
  Wrench,
  MessageSquare,
  Building2,
  List,
  Landmark,
} from 'lucide-react'
import { clearSession, getSession, saveSession } from '../lib/session'
import { hasPerm } from '../lib/boardPermissions'
import ManagerShell from '../components/ManagerShell'
import SlideDropdownMenu from '../components/SlideDropdownMenu'
import BoardWorkOrders from '../components/BoardWorkOrders'
import ComplexFinanceBlocks from '../components/ComplexFinanceBlocks'
import StaffChat from '../components/StaffChat'
import { EntityCard } from '../components/ManagerUiBits'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import type { MenuSection } from '../types'

export default function BoardMemberPanel() {
  const navigate = useNavigate()
  const [member, setMember] = useState(null)
  const [blockManagers, setBlockManagers] = useState<any[]>([])
  const [residents, setResidents] = useState<any[]>([])
  const [openMenuId, setOpenMenuId] = useState(null)
  const [activeSection, setActiveSection] = useState('home_section')
  const [subTab, setSubTab] = useState('dashboard')
  const [chatBlock, setChatBlock] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const session = getSession()
    if (!session || session.type !== 'admin' || session.admin?.role !== 'board_member') {
      navigate('/', { replace: true })
      return
    }
    setMember(session.admin)
  }, [navigate])

  const loadMeta = useCallback(async () => {
    try {
      const [bRes, rRes] = await Promise.all([
        fetch('/api/auth-block-manager'),
        fetch('/api/residents'),
      ])
      const b = await bRes.json()
      const r = await rRes.json()
      if (bRes.ok) setBlockManagers(Array.isArray(b) ? b : [])
      if (rRes.ok) setResidents(Array.isArray(r) ? r : [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (member) loadMeta()
  }, [member, loadMeta])

  const sections = useMemo(() => {
    if (!member) return []
    const subsHome = [{ id: 'dashboard', label: 'خلاصه دسترسی‌ها', desc: 'نمای کلی', icon: List }]
    const secs: MenuSection[] = [
      {
        id: 'home_section',
        label: 'میز کار',
        icon: UsersRound,
        subs: subsHome,
      },
    ]

    const workSubs: Array<{ id: string; label: string; desc: string; icon: typeof Wrench }> = []
    if (hasPerm(member, 'receive_work_orders') || hasPerm(member, 'manage_work_orders')) {
      workSubs.push({
        id: 'work_orders',
        label: 'درخواست‌های کار/تعمیر',
        desc: 'دریافت از مدیر بلوک و اقدام',
        icon: Wrench,
      })
    }
    if (workSubs.length) {
      secs.push({ id: 'ops_section', label: 'عملیات', icon: Wrench, subs: workSubs })
    }

    const finSubs: Array<{ id: string; label: string; desc: string; icon: typeof Wallet }> = []
    if (hasPerm(member, 'view_finance') || hasPerm(member, 'finance_reports')) {
      finSubs.push({
        id: 'finance',
        label: 'مدیریت / گزارش مالی',
        desc: 'وضعیت مالی بلوک‌ها',
        icon: Wallet,
      })
    }
    if (finSubs.length) {
      secs.push({ id: 'finance_section', label: 'مالی', icon: Wallet, subs: finSubs })
    }

    const chatSubs: Array<{ id: string; label: string; desc: string; icon: typeof Landmark }> = []
    if (hasPerm(member, 'chat_complex_manager')) {
      chatSubs.push({
        id: 'chat_complex',
        label: 'ارتباط با مدیر مجتمع',
        desc: 'گفتگوی خصوصی',
        icon: Landmark,
      })
    }
    if (hasPerm(member, 'chat_block_managers')) {
      chatSubs.push({
        id: 'chat_blocks',
        label: 'ارتباط با مدیر بلوک',
        desc: 'هماهنگی تعمیر / مالی',
        icon: MessageSquare,
      })
    }
    if (chatSubs.length) {
      secs.push({ id: 'comms_section', label: 'ارتباطات', icon: MessageSquare, subs: chatSubs })
    }

    if (hasPerm(member, 'view_blocks')) {
      secs.push({
        id: 'blocks_section',
        label: 'بلوک‌ها',
        icon: Building2,
        subs: [{ id: 'blocks_list', label: 'لیست بلوک‌ها', desc: 'نمای کلی', icon: List }],
      })
    }

    return secs
  }, [member])

  const openSub = (sectionId, subId) => {
    setActiveSection(sectionId)
    setSubTab(subId)
    setOpenMenuId(null)
  }

  const logout = () => {
    clearSession()
    navigate('/')
  }

  const notifyBlockFinance = async () => {
    setError('')
    try {
      // soft notify via creating a message for each block manager
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bulk: true,
          items: blockManagers.map((b) => {
            const bn = onlyDigits(b.block_number) || toEnglishDigits(b.block_number)
            return {
              audience_type: 'block_manager',
              audience_key: `${bn}|${b.block_direction}`,
              tab_key: 'finance',
              title: 'گزارش مالی هیئت مدیره',
              body: `${member.full_name} (${member.title}) وضعیت مالی را بررسی کرد. لطفاً پنل مالی را ببینید.`,
            }
          }),
        }),
      })
      // fallback if bulk not supported: sequential
      if (!res.ok) {
        for (const b of blockManagers) {
          const bn = onlyDigits(b.block_number) || toEnglishDigits(b.block_number)
          await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audience_type: 'block_manager',
              audience_key: `${bn}|${b.block_direction}`,
              tab_key: 'finance',
              title: 'گزارش مالی هیئت مدیره',
              body: `${member.full_name} (${member.title}) وضعیت مالی را بررسی کرد.`,
            }),
          })
        }
      }
      alert('اطلاع‌رسانی برای مدیران بلوک ارسال شد')
    } catch (err) {
      setError(err.message || 'ارسال اطلاع‌رسانی ناموفق بود')
    }
  }

  if (!member) {
    return (
      <div className="min-h-screen flex items-center justify-center panel-page" dir="rtl">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <ManagerShell
      title={`هیئت مدیره — ${member.title}`}
      subtitle={`${member.full_name} · ${member.complex_name}`}
      icon={UsersRound}
      designKey={`block7_board_${member.id}_design_v3`}
      helpTitle="راهنمای عضو هیئت مدیره"
      helpItems={[
        {
          title: 'دسترسی‌ها',
          body: 'مدیر مجتمع برای سمت شما دسترسی‌ها را تعیین کرده است: ارتباط، مالی، درخواست تعمیر و …',
        },
        {
          title: 'تعمیرات',
          body: 'اگر دسترسی دارید، درخواست‌های مدیر بلوک را دریافت و پس از هماهنگی وضعیت را به‌روز کنید.',
        },
        {
          title: 'مالی',
          body: 'با دسترسی مالی می‌توانید وضعیت بلوک‌ها را ببینید و نتیجه بررسی را به مدیر بلوک اطلاع دهید.',
        },
      ]}
      onLogout={logout}
      passwordApi={{
        url: '/api/auth-board',
        bodyFromForm: (f) => ({ id: member.id, ...f }),
        onSuccess: (data) => {
          if (data.admin) {
            const session = getSession()
            if (session?.type === 'admin') {
              saveSession({
                ...session,
                admin: { ...session.admin, ...data.admin, role: 'board_member' },
              })
              setMember((p) => ({ ...p, ...data.admin, role: 'board_member' }))
            }
          }
        },
      }}
    >
      {error && <div className="msg-error rounded-xl px-4 py-3 text-sm font-semibold">{error}</div>}

      <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-xs font-bold text-indigo-950 leading-6">
        سمت: <strong>{member.title}</strong>
        {member.responsibility ? ` — ${member.responsibility}` : ''}
      </div>

      <SlideDropdownMenu
        sections={sections}
        openId={openMenuId}
        activeSubId={subTab}
        onToggle={(id) => setOpenMenuId((p) => (p === id ? null : id))}
        onSelectSub={openSub}
        getSectionBadge={() => 0}
        getSubBadge={() => 0}
      />

      <div className="bm-main-panel">
        {subTab === 'dashboard' && (
          <div className="space-y-3">
            <h2 className="panel-title text-lg">دسترسی‌های فعال شما</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {Object.entries(member.permissions || {})
                .filter(([, v]) => v)
                .map(([k]) => (
                  <div
                    key={k}
                    className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    ✓ {k}
                  </div>
                ))}
            </div>
            <p className="text-xs font-semibold text-slate-600">
              از منوی بالا بخش‌های مجاز را باز کنید. ورود شما توسط مدیر مجتمع تعریف شده است.
            </p>
          </div>
        )}

        {subTab === 'work_orders' && (
          <BoardWorkOrders
            mode="manage"
            complexName={member.complex_name}
            memberId={member.id}
            memberTitle={member.title}
            actorName={member.full_name}
            actorRole="board_member"
          />
        )}

        {subTab === 'finance' && (
          <div className="space-y-3">
            {hasPerm(member, 'notify_block_managers_finance') && (
              <button type="button" className="btn-admin !mt-0" onClick={notifyBlockFinance}>
                اعلام نتیجه بررسی مالی به مدیران بلوک
              </button>
            )}
            <ComplexFinanceBlocks
              admin={{ complex_name: member.complex_name, full_name: member.full_name, role: 'board_member' }}
              blockManagers={blockManagers}
              residents={residents}
            />
          </div>
        )}

        {subTab === 'chat_complex' && (
          <StaffChat
            channel="system_complex"
            complex_name={member.complex_name}
            // reuse channel key per complex; board talks as complex_manager side for storage simplicity
            sender_role="complex_manager"
            sender_name={`${member.full_name} (${member.title})`}
            title="ارتباط با مدیر مجتمع"
          />
        )}

        {subTab === 'chat_blocks' && (
          <div className="space-y-3">
            <label className="block max-w-md">
              <span className="field-label text-xs mb-1.5 block">انتخاب مدیر بلوک</span>
              <select
                className="field-input"
                value={
                  chatBlock
                    ? `${toEnglishDigits(chatBlock.block_number)}|${chatBlock.block_direction}`
                    : ''
                }
                onChange={(e) => {
                  const b = blockManagers.find(
                    (x) =>
                      `${toEnglishDigits(x.block_number)}|${x.block_direction}` === e.target.value,
                  )
                  setChatBlock(b || null)
                }}
              >
                <option value="">انتخاب بلوک</option>
                {blockManagers.map((b) => (
                  <option
                    key={b.id || `${b.block_number}-${b.block_direction}`}
                    value={`${toEnglishDigits(b.block_number)}|${b.block_direction}`}
                  >
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
                sender_name={`${member.full_name} (${member.title})`}
                title={`گفتگو با مدیر بلوک ${chatBlock.block_number} ${chatBlock.block_direction}`}
              />
            ) : (
              <div className="text-center py-10 text-sky-800 font-semibold text-sm">
                یک بلوک را برای هماهنگی انتخاب کنید
              </div>
            )}
          </div>
        )}

        {subTab === 'blocks_list' && (
          <div className="grid sm:grid-cols-2 gap-3">
            {blockManagers.map((b) => (
              <EntityCard
                key={b.id || `${b.block_number}-${b.block_direction}`}
                icon={Building2}
                title={`بلوک ${b.block_number} ${b.block_direction}`}
                subtitle={b.full_name || 'مدیر بلوک'}
                meta={
                  hasPerm(member, 'chat_block_managers')
                    ? 'برای گفتگو از منوی ارتباطات استفاده کنید'
                    : 'نمای اطلاعاتی'
                }
                onClick={() => {
                  if (hasPerm(member, 'chat_block_managers')) {
                    setChatBlock(b)
                    setSubTab('chat_blocks')
                    setActiveSection('comms_section')
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </ManagerShell>
  )
}
