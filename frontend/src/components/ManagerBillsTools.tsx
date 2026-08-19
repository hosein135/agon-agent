import { useEffect, useMemo, useState } from 'react'
import {
  Receipt,
  AlertCircle,
  Plus,
  CheckCircle2,
  Pencil,
  Trash2,
  Check,
  X,
  FileCheck2,
} from 'lucide-react'
import { toEnglishDigits, onlyDigits } from '../lib/digits'
import { sortBillsUnpaidFirst, billStatusClass, billStatusLabel, isBillPaid } from '../lib/billStatus'
import { amountToPersianTomanLabel } from '../lib/numberWords'
import type { AdminUser, ChangedHandler, Resident } from '../types'

const BILL_TITLES = ['قبض برق', 'قبض آب', 'ذخیره صندوق', 'سایر']

const emptyForm = {
  unit_name: '',
  title: 'قبض برق',
  amount: '',
  other_type: '',
  description: '',
  /** 'ساکن' | 'مالک' | 'مستاجر' | id:N */
  payer: 'ساکن',
}

export default function ManagerBillsTools({
  admin,
  residents = [],
  onChanged,
}: {
  admin: AdminUser
  residents?: Resident[]
  onChanged?: ChangedHandler
}) {
  const [bills, setBills] = useState<any[]>([])
  const [receipts, setReceipts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', amount: '', other_type: '', description: '' })
  const amountWords = amountToPersianTomanLabel(form.amount)
  const editAmountWords = amountToPersianTomanLabel(editForm.amount)

  const load = async () => {
    setError('')
    try {
      const params = new URLSearchParams()
      if (admin?.block_number) params.set('block_number', admin.block_number)
      if (admin?.block_direction) params.set('block_direction', admin.block_direction)
      const [bRes, rRes] = await Promise.all([
        fetch(`/api/bills?${params.toString()}`),
        fetch(`/api/receipts?${params.toString()}`),
      ])
      const bData = await bRes.json()
      const rData = await rRes.json()
      if (!bRes.ok) throw new Error(bData.error || 'خطا در دریافت قبض‌ها')
      setBills(Array.isArray(bData) ? bData : [])
      setReceipts(Array.isArray(rData) ? rData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.block_number, admin?.block_direction])

  const receiptSumByUnit = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of receipts) {
      const u = r.unit_name
      map[u] = (map[u] || 0) + Number(r.amount || 0)
    }
    return map
  }, [receipts])

  const blockResidents = useMemo(() => {
    const list = Array.isArray(residents) ? residents : []
    if (!admin?.block_number) return list.filter((r) => r.status !== 'blocked')
    const bn = onlyDigits(admin.block_number) || toEnglishDigits(admin.block_number)
    const bd = String(admin.block_direction || '')
    return list.filter((r) => {
      if (r.status === 'blocked') return false
      const rbn = onlyDigits(r.block_number) || toEnglishDigits(r.block_number || '')
      const rbd = String(r.block_direction || '')
      const sameBn = Boolean(bn) && rbn === bn
      const sameBd = !bd || !rbd || rbd === bd
      return sameBn && sameBd
    })
  }, [residents, admin?.block_number, admin?.block_direction])

  /** واحدها: مالک و مستاجر ممکن است هر دو باشند */
  const unitOptions = useMemo(() => {
    const map = new Map()
    for (const r of blockResidents) {
      const u = String(r.unit_name || '').trim()
      if (!u) continue
      if (!map.has(u)) map.set(u, [])
      map.get(u).push(r)
    }
    return Array.from(map.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'fa'))
      .map(([unit_name, people]) => ({ unit_name, people }))
  }, [blockResidents])

  const selectedUnitPeople = useMemo(() => {
    const u = String(form.unit_name || '').trim()
    if (!u) return []
    return blockResidents.filter((r) => String(r.unit_name).trim() === u)
  }, [blockResidents, form.unit_name])

  /** فقط تیک «ساکن فعلی» — بدون fallback */
  const pickOccupant = (unitPeople, { strict = true } = {}) => {
    if (!unitPeople?.length) return null
    const marked = unitPeople.find((p) => p.is_occupant)
    if (marked) return marked
    if (strict) return null
    if (unitPeople.length === 1) return unitPeople[0]
    return (
      unitPeople.find((p) => p.occupancy === 'مستاجر') ||
      unitPeople.find((p) => p.occupancy === 'مالک') ||
      unitPeople[0]
    )
  }

  const unitHasOccupant = (people) => (people || []).some((p) => p.is_occupant)

  /** واحدهایی که تیک ساکن فعلی دارند — مبنای صدور گروهی و محاسبه نفرات */
  const occupiedUnitOptions = useMemo(
    () => unitOptions.filter(({ people }) => unitHasOccupant(people)),
    [unitOptions],
  )

  const vacantUnitOptions = useMemo(
    () => unitOptions.filter(({ people }) => !unitHasOccupant(people)),
    [unitOptions],
  )

  const resolvePayerFields = (unitName, payerValue) => {
    const unitPeople = blockResidents.filter((r) => String(r.unit_name).trim() === String(unitName).trim())
    const pack = (p, fallbackOcc = '') => {
      if (!p) {
        return {
          payer_resident_id: null,
          payer_occupancy: fallbackOcc,
          payer_name: fallbackOcc || '',
          missing: true,
        }
      }
      return {
        payer_resident_id: p.id,
        payer_occupancy: p.occupancy || fallbackOcc || '',
        payer_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.occupancy || fallbackOcc,
        missing: false,
      }
    }

    // «ساکن» = فقط کسی که تیک ساکن فعلی دارد (بدون جایگزین خودکار)
    if (!payerValue || payerValue === 'ساکن') {
      return pack(pickOccupant(unitPeople, { strict: true }), 'ساکن')
    }
    if (payerValue === 'مالک' || payerValue === 'مستاجر') {
      const p = unitPeople.find((x) => x.occupancy === payerValue)
      return pack(p, payerValue)
    }
    if (String(payerValue).startsWith('id:')) {
      const id = Number(String(payerValue).slice(3))
      const p =
        unitPeople.find((x) => Number(x.id) === id) ||
        blockResidents.find((x) => Number(x.id) === id)
      return pack(p)
    }
    return { payer_resident_id: null, payer_occupancy: '', payer_name: '', missing: true }
  }

  const peopleOf = (r) => {
    const n = Number(r?.people_count)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  }

  const unitPeopleCount = (people) => Math.max(1, ...(people || []).map(peopleOf), 1)

  const blockPeopleTotal = useMemo(() => {
    // فقط واحدهای دارای ساکن فعلی
    let total = 0
    for (const { people } of occupiedUnitOptions) {
      total += unitPeopleCount(people)
    }
    return total
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occupiedUnitOptions])

  const isWaterBill = form.title === 'قبض آب'
  const totalAmountNum = Number(toEnglishDigits(form.amount).replace(/[^\d.]/g, '')) || 0
  const waterPerPerson =
    isWaterBill && blockPeopleTotal > 0 && totalAmountNum > 0
      ? totalAmountNum / blockPeopleTotal
      : 0

  /** تقسیم مبلغ کل آب بلوک بر نفرات — هر واحد: (مبلغ‌کل/کل‌نفرات)×نفرات‌واحد */
  const splitWaterByPeople = (totalAmount, units) => {
    const totalPeople = units.reduce((s, r) => s + peopleOf(r), 0)
    if (totalPeople < 1) throw new Error('تعداد نفرات بلوک نامعتبر است')
    const perPerson = totalAmount / totalPeople
    let allocated = 0
    return units.map((r, idx) => {
      const people = peopleOf(r)
      let amount
      if (idx === units.length - 1) {
        // باقیمانده به آخرین واحد تا جمع دقیقاً برابر مبلغ کل شود
        amount = Math.max(0, Math.round(totalAmount - allocated))
      } else {
        amount = Math.round(perPerson * people)
        allocated += amount
      }
      return {
        unit_name: r.unit_name,
        block_number: r.block_number || admin?.block_number || '',
        block_direction: r.block_direction || admin?.block_direction || '',
        amount,
        people,
        per_person: Math.round(perPerson),
        total_people: totalPeople,
        total_amount: totalAmount,
      }
    })
  }

  const createBill = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    try {
      if (form.title === 'سایر' && !String(form.other_type || '').trim()) {
        setError('لطفاً نوع «سایر» را توضیح دهید')
        return
      }
      const amtRaw = toEnglishDigits(form.amount).replace(/[^\d.]/g, '')
      if (!amtRaw || Number(amtRaw) <= 0) {
        setError('مبلغ معتبر وارد کنید')
        return
      }
      const totalAmount = Number(amtRaw)

      const due_date = new Date().toISOString()
      const title =
        form.title === 'سایر' ? `سایر — ${String(form.other_type).trim()}` : form.title
      const waterMode = title === 'قبض آب' || String(title).includes('قبض آب')

      const descriptionParts: string[] = []
      if (form.title === 'سایر' && form.other_type) {
        descriptionParts.push(`نوع: ${String(form.other_type).trim()}`)
      }
      if (form.description?.trim()) descriptionParts.push(form.description.trim())

      const selectedUnit = String(form.unit_name || '').trim()
      let targets = []

      const payerMode = form.payer || 'ساکن'
      const isOccupantMode = !payerMode || payerMode === 'ساکن'

      if (selectedUnit) {
        // یک واحد: مبلغ همان مبلغ واردشده (سهم واحد)
        const unitPeople = selectedUnitPeople
        const unit = unitPeople[0] || residents.find((r) => r.unit_name === selectedUnit)
        const people = unitPeopleCount(unitPeople.length ? unitPeople : [unit])
        const payer = resolvePayerFields(selectedUnit, payerMode)
        if (isOccupantMode && (payer.missing || !payer.payer_resident_id)) {
          setError(
            `واحد ${selectedUnit} تیک «ساکن فعلی» ندارد. ابتدا در لیست ساکنین تیک ساکن را بزنید یا پرداخت‌کننده دیگری انتخاب کنید.`,
          )
          return
        }
        if (!payer.payer_resident_id && !payer.payer_occupancy) {
          setError('پرداخت‌کننده را انتخاب کنید (ساکن / مالک / مستاجر)')
          return
        }
        targets = [
          {
            unit_name: selectedUnit,
            block_number: unit?.block_number || admin?.block_number || '',
            block_direction: unit?.block_direction || admin?.block_direction || '',
            amount: totalAmount,
            people,
            ...payer,
          },
        ]
      } else {
        // همه واحدها
        // در حالت «ساکن»: فقط واحدهایی که تیک ساکن فعلی دارند
        const sourceOptions = isOccupantMode ? occupiedUnitOptions : unitOptions
        if (!sourceOptions.length) {
          setError(
            isOccupantMode
              ? 'هیچ واحدی با تیک «ساکن فعلی» یافت نشد. در لیست ساکنین برای واحدهای موردنظر تیک ساکن را فعال کنید.'
              : 'واحدی برای صدور گروهی یافت نشد',
          )
          return
        }

        const unitRows = sourceOptions.map(({ unit_name, people }) => {
          const occ = pickOccupant(people, { strict: true })
          const head = occ || people[0]
          const pc = unitPeopleCount(people)
          return {
            ...head,
            unit_name,
            people_count: pc,
            _people: people,
          }
        })
        const peopleTotal = unitRows.reduce((s, r) => s + Number(r.people_count || 1), 0)
        const vacantNote =
          isOccupantMode && vacantUnitOptions.length
            ? `\n⚠️ ${vacantUnitOptions.length.toLocaleString('fa-IR')} واحد بدون تیک ساکن از محاسبه و صدور حذف شدند: ${vacantUnitOptions
                .map((v) => v.unit_name)
                .slice(0, 8)
                .join('، ')}${vacantUnitOptions.length > 8 ? '…' : ''}`
            : ''

        if (waterMode) {
          if (peopleTotal < 1) {
            setError('تعداد نفرات واحدهای دارای ساکن برای محاسبه قبض آب مشخص نیست')
            return
          }
          const perP = Math.round(totalAmount / peopleTotal)
          if (
            !confirm(
              `قبض آب — مبلغ کل ${totalAmount.toLocaleString('fa-IR')} تومان\n` +
                `فقط واحدهای دارای ساکن فعلی\n` +
                `کل نفرات: ${peopleTotal.toLocaleString('fa-IR')} نفر · ${unitRows.length.toLocaleString('fa-IR')} واحد\n` +
                `سهم هر نفر: حدود ${perP.toLocaleString('fa-IR')} تومان` +
                vacantNote +
                `\n\nصادر شود؟`,
            )
          ) {
            return
          }
          targets = splitWaterByPeople(totalAmount, unitRows)
            .map((t) => {
              const payer = resolvePayerFields(t.unit_name, payerMode)
              return { ...t, ...payer }
            })
            .filter((t) => !t.missing && t.payer_resident_id)
        } else {
          const payerLabel =
            payerMode === 'مالک' ? 'مالک' : payerMode === 'مستاجر' ? 'مستاجر' : 'ساکن فعلی'
          if (
            !confirm(
              `قبض «${title}» برای ${unitRows.length.toLocaleString('fa-IR')} واحد (پرداخت‌کننده: ${payerLabel}) صادر شود؟` +
                vacantNote,
            )
          ) {
            return
          }
          targets = unitRows
            .map((r) => {
              const payer = resolvePayerFields(r.unit_name, payerMode)
              return {
                unit_name: r.unit_name,
                block_number: r.block_number || admin?.block_number || '',
                block_direction: r.block_direction || admin?.block_direction || '',
                amount: totalAmount,
                people: Number(r.people_count || 1),
                ...payer,
              }
            })
            .filter((t) => {
              if (isOccupantMode) return !t.missing && t.payer_resident_id
              if (payerMode === 'مالک' || payerMode === 'مستاجر') {
                return !t.missing // need that role present
              }
              return true
            })
        }

        if (!targets.length) {
          setError('پس از اعمال فیلتر ساکن/پرداخت‌کننده، واحدی برای صدور باقی نماند')
          return
        }
      }

      let created = 0
      const errors: string[] = []
      const skipped: string[] = []
      for (const t of targets) {
        if (isOccupantMode && (t.missing || !t.payer_resident_id)) {
          skipped.push(t.unit_name)
          continue
        }
        const descParts = [...descriptionParts]
        if (waterMode && !selectedUnit && t.people != null) {
          descParts.unshift(
            `محاسبه نفرات: مبلغ‌کل ${Number(t.total_amount || totalAmount).toLocaleString('fa-IR')} تومان ÷ ${Number(t.total_people || blockPeopleTotal).toLocaleString('fa-IR')} نفر (فقط واحدهای دارای ساکن) = ${Number(t.per_person || 0).toLocaleString('fa-IR')} تومان/نفر × ${Number(t.people).toLocaleString('fa-IR')} نفر واحد`,
          )
        }
        if (t.payer_name || t.payer_occupancy) {
          descParts.push(
            `پرداخت‌کننده: ${t.payer_name || t.payer_occupancy}${t.payer_occupancy ? ` (${t.payer_occupancy})` : ''}`,
          )
        }
        const description = descParts.join(' | ')

        const res = await fetch('/api/bills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            unit_name: t.unit_name,
            title,
            amount: t.amount,
            due_date,
            description,
            block_number: t.block_number,
            block_direction: t.block_direction,
            created_by: admin?.full_name || admin?.complex_name || 'مدیر',
            created_by_role: admin?.role || 'block_manager',
            payer_resident_id: t.payer_resident_id || null,
            payer_occupancy: t.payer_occupancy || '',
            payer_name: t.payer_name || '',
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          errors.push(`${t.unit_name}: ${data.error || 'خطا'}`)
        } else {
          created += 1
        }
      }

      if (created === 0) {
        throw new Error(errors[0] || 'ثبت قبض ناموفق بود')
      }

      const payerHint =
        form.payer === 'مالک'
          ? 'مالک'
          : form.payer === 'مستاجر'
            ? 'مستاجر'
            : form.payer === 'ساکن' || !form.payer
              ? 'ساکن فعلی'
              : 'پرداخت‌کننده تعیین‌شده'
      const firstPayerName = targets[0]?.payer_name || targets[0]?.payer_occupancy || payerHint
      setForm(emptyForm)
      if (selectedUnit) {
        setSuccess(`قبض برای واحد ${selectedUnit} ثبت و برای ${firstPayerName} ارسال شد`)
      } else if (waterMode) {
        setSuccess(
          `قبض آب بر اساس نفرات برای ${created.toLocaleString('fa-IR')} واحد صادر شد` +
            (errors.length ? ` — ${errors.length} مورد خطا` : ''),
        )
      } else {
        setSuccess(
          `قبض «${title}» برای ${created.toLocaleString('fa-IR')} واحد صادر شد (${payerHint})` +
            (errors.length ? ` — ${errors.length} مورد خطا` : ''),
        )
      }
      if (errors.length && created > 0) {
        setError(errors.slice(0, 5).join(' | '))
      }
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    }
  }

  const confirmPay = async (id) => {
    setBusyId(id)
    setError('')
    setSuccess('')
    try {
      const bill = bills.find((x) => x.id === id)
      if (bill?.status === 'در انتظار تایید' || String(bill?.status || '').includes('انتظار')) {
        const res = await fetch('/api/bills', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'review_receipt',
            id,
            decision: 'approve',
            reviewed_by: admin?.full_name || 'مدیر بلوک',
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'تایید رسید ناموفق بود')
        setSuccess('رسید تایید شده و قبض سبز شد')
        await load()
        onChanged?.()
        return
      }

      const res = await fetch('/api/bills', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'پرداخت‌شده' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'تایید ناموفق بود')
      setSuccess('پرداخت قبض تایید شد')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const startEdit = (b) => {
    const isOther = String(b.title || '').startsWith('سایر')
    setEditingId(b.id)
    setEditForm({
      title: isOther ? 'سایر' : BILL_TITLES.includes(b.title) ? b.title : 'سایر',
      amount: String(b.amount ?? ''),
      other_type: isOther ? String(b.title).replace(/^سایر\s*—\s*/, '') : '',
      description: b.description || '',
    })
    setError('')
    setSuccess('')
  }

  const saveEdit = async (id) => {
    setBusyId(id)
    setError('')
    setSuccess('')
    try {
      if (editForm.title === 'سایر' && !String(editForm.other_type || '').trim()) {
        setError('لطفاً نوع «سایر» را توضیح دهید')
        setBusyId(null)
        return
      }
      const current = bills.find((x) => x.id === id)
      if (!current) throw new Error('قبض یافت نشد')

      const title =
        editForm.title === 'سایر' ? `سایر — ${String(editForm.other_type).trim()}` : editForm.title

      // ویرایش از طریق حذف + ثبت مجدد (با حفظ واحد/بلوک/وضعیت در صورت امکان)
      const delRes = await fetch('/api/bills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const delData = await delRes.json()
      if (!delRes.ok) throw new Error(delData.error || 'ویرایش ناموفق بود')

      const createRes = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_name: current.unit_name,
          title,
          amount: editForm.amount,
          due_date: current.due_date || current.created_at || new Date().toISOString(),
          description: editForm.description,
          block_number: current.block_number || admin?.block_number || '',
          block_direction: current.block_direction || admin?.block_direction || '',
          created_by: admin?.full_name || current.created_by || 'مدیر',
          created_by_role: admin?.role || current.created_by_role || 'block_manager',
        }),
      })
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error || 'ویرایش ناموفق بود')

      // بازگردانی وضعیت قبلی اگر پرداخت‌شده/در انتظار بوده
      if (current.status && current.status !== 'پرداخت‌نشده' && createData?.id) {
        await fetch('/api/bills', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: createData.id, status: current.status }),
        })
      }

      setEditingId(null)
      setSuccess('قبض با موفقیت ویرایش شد')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const removeBill = async (id) => {
    if (!confirm('آیا از حذف این قبض مطمئن هستید؟')) return
    setBusyId(id)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/bills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'حذف ناموفق بود')
      setSuccess('قبض حذف شد')
      await load()
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const money = (n) => `${Number(n || 0).toLocaleString('fa-IR')} تومان`
  const sortedBills = sortBillsUnpaidFirst(bills)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-indigo-600" />
        <h2 className="panel-title text-lg">ثبت قبض</h2>
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

      <form onSubmit={createBill} className="panel-card rounded-2xl p-4 grid sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2">
          <span className="field-label text-xs mb-1.5 block">واحد (اختیاری)</span>
          <select
            className="field-input"
            value={form.unit_name}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                unit_name: e.target.value,
                payer: 'ساکن', // ریست به ساکن فعلی با عوض شدن واحد
              }))
            }
          >
            <option value="">
              همه واحدهای دارای ساکن ({occupiedUnitOptions.length.toLocaleString('fa-IR')} از{' '}
              {unitOptions.length.toLocaleString('fa-IR')}) — در حالت پرداخت‌کننده «ساکن»
            </option>
            {unitOptions.map(({ unit_name, people }) => {
              const occ = people.find((r) => r.is_occupant)
              const label = people
                .map((r) => `${r.occupancy || 'شخص'}: ${r.first_name || ''} ${r.last_name || ''}`.trim())
                .join(' / ')
              return (
                <option key={unit_name} value={unit_name}>
                  {unit_name}
                  {occ ? ' ★ساکن' : ' ○خالی'}
                  {label ? ` — ${label}` : ''}
                </option>
              )
            })}
          </select>
          <p className="mt-1.5 text-[11px] font-bold text-sky-800 leading-5">
            با پرداخت‌کننده <strong>«ساکن»</strong> فقط واحدهایی که در لیست ساکنین تیک{' '}
            <strong>ساکن فعلی</strong> دارند در محاسبه و صدور وارد می‌شوند
            {vacantUnitOptions.length > 0 && (
              <>
                {' '}
                ({vacantUnitOptions.length.toLocaleString('fa-IR')} واحد بدون تیک حذف می‌شود)
              </>
            )}
            .
            {isWaterBill && (
              <>
                {' '}
                برای <strong>قبض آب</strong> مبلغ فقط بر نفرات همین واحدهای دارای ساکن تقسیم می‌شود.
              </>
            )}
          </p>
        </label>

        <label className="block sm:col-span-2">
          <span className="field-label text-xs mb-1.5 block">پرداخت‌کننده قبض</span>
          {form.unit_name ? (
            <select
              className="field-input"
              value={form.payer || 'ساکن'}
              onChange={(e) => setForm((p) => ({ ...p, payer: e.target.value }))}
              required
            >
              <option value="ساکن">
                ساکن فعلی
                {(() => {
                  const o = pickOccupant(selectedUnitPeople, { strict: true })
                  return o
                    ? ` — ${o.first_name || ''} ${o.last_name || ''} (${o.occupancy || ''})`.trim()
                    : ' — (تیک نخورده!)'
                })()}
              </option>
              {selectedUnitPeople.map((r) => (
                <option key={r.id} value={`id:${r.id}`}>
                  {r.occupancy || 'شخص'} — {r.first_name} {r.last_name}
                  {r.is_occupant ? ' ★ ساکن' : ''}
                  {r.phone ? ` (${r.phone})` : ''}
                </option>
              ))}
              <option value="مالک">مالک واحد</option>
              <option value="مستاجر">مستاجر واحد</option>
            </select>
          ) : (
            <select
              className="field-input"
              value={form.payer || 'ساکن'}
              onChange={(e) => setForm((p) => ({ ...p, payer: e.target.value }))}
            >
              <option value="ساکن">ساکن فعلی هر واحد (تیک «ساکن» در لیست ساکنین)</option>
              <option value="مالک">همه قبض‌ها برای مالک هر واحد</option>
              <option value="مستاجر">همه قبض‌ها برای مستاجر هر واحد</option>
            </select>
          )}
          <p className="mt-1.5 text-[11px] font-bold text-amber-900 leading-5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
            گزینه <strong>«ساکن»</strong> = شخصی که در لیست ساکنین تیک <strong>ساکن فعلی</strong> دارد
            (چه مالک باشد چه مستاجر). قبض فقط برای همان شخص ارسال می‌شود.
          </p>
        </label>

        <label className="block">
          <span className="field-label text-xs mb-1.5 block">عنوان قبض</span>
          <select
            className="field-input"
            value={form.title}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                title: e.target.value,
                other_type: e.target.value === 'سایر' ? p.other_type : '',
              }))
            }
            required
          >
            {BILL_TITLES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="field-label text-xs mb-1.5 block">
            {isWaterBill && !form.unit_name
              ? 'مبلغ کل قبض آب بلوک (تومان)'
              : 'مبلغ (تومان)'}
          </span>
          {amountWords ? (
            <div className="mb-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[12px] font-black text-emerald-800">
              {amountWords}
            </div>
          ) : (
            <div className="mb-1.5 text-[11px] font-bold text-slate-500">مبلغ به حروف اینجا نمایش داده می‌شود</div>
          )}
          <input
            className="field-input dir-ltr"
            value={form.amount}
            onChange={(e) => {
              setSuccess('')
              setForm((p) => ({ ...p, amount: toEnglishDigits(e.target.value).replace(/[^\d]/g, '') }))
            }}
            placeholder={isWaterBill && !form.unit_name ? 'مبلغ کل آب بلوک' : '1500000'}
            inputMode="numeric"
            required
          />
        </label>

        {isWaterBill && !form.unit_name && (
          <div className="sm:col-span-2 rounded-xl border-2 border-cyan-200 bg-cyan-50 px-3 py-2.5 text-xs font-bold text-cyan-950 leading-6 space-y-1">
            <p className="font-black mb-1">محاسبه قبض آب — فقط واحدهای دارای تیک «ساکن»</p>
            <p>
              واحد دارای ساکن:{' '}
              <strong>{occupiedUnitOptions.length.toLocaleString('fa-IR')}</strong>
              {' · '}
              کل نفرات:{' '}
              <strong>{blockPeopleTotal.toLocaleString('fa-IR')} نفر</strong>
              {totalAmountNum > 0 && (
                <>
                  {' · '}
                  سهم هر نفر:{' '}
                  <strong>{Math.round(waterPerPerson).toLocaleString('fa-IR')} تومان</strong>
                </>
              )}
            </p>
            {vacantUnitOptions.length > 0 && (
              <p className="text-[11px] font-black text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
                حذف از محاسبه (بدون تیک ساکن):{' '}
                {vacantUnitOptions.map((v) => v.unit_name).join('، ')}
              </p>
            )}
            <p className="mt-1 text-[11px] font-semibold text-cyan-900">
              واحد بدون تیک ساکن در تقسیم مبلغ و صدور قبض لحاظ نمی‌شود.
            </p>
          </div>
        )}

        {form.title === 'سایر' && (
          <label className="block sm:col-span-2">
            <span className="field-label text-xs mb-1.5 block">توضیح نوع سایر</span>
            <input
              className="field-input"
              value={form.other_type}
              onChange={(e) => setForm((p) => ({ ...p, other_type: e.target.value }))}
              placeholder="نوع قبض را بنویسید..."
              required
            />
          </label>
        )}

        <label className="block sm:col-span-2">
          <span className="field-label text-xs mb-1.5 block">توضیحات (اختیاری)</span>
          <input
            className="field-input"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="توضیح تکمیلی..."
          />
        </label>

        <div className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-bold text-slate-600">
          تاریخ سررسید = زمان ثبت شارژ (به‌صورت خودکار ثبت می‌شود)
        </div>

        <div className="sm:col-span-2">
          <button type="submit" className="btn-admin !mt-0 inline-flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" />
            {form.unit_name
              ? 'ارسال قبض برای پرداخت‌کننده انتخاب‌شده'
              : form.payer === 'ساکن' || !form.payer
                ? `صدور برای واحدهای دارای ساکن (${occupiedUnitOptions.length.toLocaleString('fa-IR')} واحد)`
                : `صدور قبض گروهی (${unitOptions.length.toLocaleString('fa-IR')} واحد)`}
          </button>
        </div>
      </form>

      {/* لیست قبض‌ها به‌صورت باکس */}
      <div className="space-y-3">
        <h3 className="text-sm font-black text-sky-950">قبض‌های ثبت‌شده</h3>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-9 h-9 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedBills.length === 0 ? (
          <div className="panel-card rounded-2xl p-8 text-center text-sky-800 font-semibold">قبضی ثبت نشده</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {sortedBills.map((b) => {
              const paid = isBillPaid(b.status)
              const pending = b.status === 'در انتظار تایید'
              const receiptAmount = Number(receiptSumByUnit[b.unit_name] || 0)
              const editing = editingId === b.id
              return (
                <div
                  key={b.id}
                  className={`bill-box ${paid ? 'is-paid' : pending ? 'is-pending' : 'is-unpaid'}`}
                >
                  {editing ? (
                    <div className="space-y-2.5">
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">نوع قبض</span>
                        <select
                          className="field-input !py-2"
                          value={editForm.title}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              title: e.target.value,
                              other_type: e.target.value === 'سایر' ? p.other_type : '',
                            }))
                          }
                        >
                          {BILL_TITLES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                      {editForm.title === 'سایر' && (
                        <label className="block">
                          <span className="field-label text-xs mb-1 block">توضیح نوع سایر</span>
                          <input
                            className="field-input !py-2"
                            value={editForm.other_type}
                            onChange={(e) => setEditForm((p) => ({ ...p, other_type: e.target.value }))}
                          />
                        </label>
                      )}
                      <label className="block">
                        <span className="field-label text-xs mb-1 block">مبلغ قبض</span>
                        {editAmountWords && (
                          <div className="mb-1 text-[11px] font-black text-emerald-800">{editAmountWords}</div>
                        )}
                        <input
                          className="field-input !py-2 dir-ltr"
                          value={editForm.amount}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              amount: toEnglishDigits(e.target.value).replace(/[^\d]/g, ''),
                            }))
                          }
                          inputMode="numeric"
                        />
                      </label>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => saveEdit(b.id)}
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
                      <div className="bill-box-top">
                        <div>
                          <p className="bill-box-kicker">
                          واحد {b.unit_name}
                          {(b.payer_name || b.payer_occupancy) && (
                            <span className="block text-[11px] font-bold text-violet-800 mt-0.5">
                              پرداخت‌کننده: {b.payer_name || b.payer_occupancy}
                              {b.payer_occupancy && b.payer_name ? ` (${b.payer_occupancy})` : ''}
                            </span>
                          )}
                        </p>
                          <h4 className="bill-box-title">{b.title}</h4>
                        </div>
                        <span className={billStatusClass(b.status)}>{billStatusLabel(b.status)}</span>
                      </div>

                      <div className="bill-box-grid">
                        <div className="bill-box-field">
                          <span>نوع قبض</span>
                          <strong>{b.title}</strong>
                        </div>
                        <div className="bill-box-field">
                          <span>مبلغ قبض</span>
                          <strong className={paid ? 'text-emerald-700' : 'text-rose-700'}>
                            {money(b.amount)}
                          </strong>
                        </div>
                        <div className="bill-box-field">
                          <span>رسید دریافتی</span>
                          <strong className="inline-flex items-center gap-1 text-sky-800">
                            <FileCheck2 className="w-3.5 h-3.5" />
                            {receiptAmount > 0 ? money(receiptAmount) : 'ثبت نشده'}
                          </strong>
                        </div>
                      </div>

                      <div className="bill-box-actions">
                        <button
                          type="button"
                          disabled={busyId === b.id || paid}
                          onClick={() => confirmPay(b.id)}
                          className="bill-box-btn is-confirm"
                          title={pending ? 'تایید رسید ساکن' : 'تایید پرداخت'}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {pending ? 'تایید رسید' : 'تایید'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => startEdit(b)}
                          className="bill-box-btn is-edit"
                          title="ویرایش"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          ویرایش
                        </button>
                        <button
                          type="button"
                          disabled={busyId === b.id}
                          onClick={() => removeBill(b.id)}
                          className="bill-box-btn is-delete"
                          title="حذف"
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
    </div>
  )
}
