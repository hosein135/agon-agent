'use client'

import { useEffect, useState } from 'react'
import { useNavigate } from '../lib/nav'
import { getSession, saveSession } from '../lib/session'
import { toEnglishDigits } from '../lib/digits'

const MAIN_TABS = [
  { id: 'register', label: 'ثبت نام ساکنین' },
  { id: 'user', label: 'ورود ساکنین' },
  { id: 'admin', label: 'ثبت نام و ورود مدیر' },
]

const ADMIN_TABS = [
  { id: 'block_manager', label: 'مدیر بلوک' },
  { id: 'complex_manager', label: 'مدیر مجتمع' },
  { id: 'board_member', label: 'هیئت مدیره' },
  { id: 'system_admin', label: 'مدیر سیستم' },
]

const BLOCK_SUB_TABS = [
  { id: 'request', label: 'عضویت و رمز' },
  { id: 'list', label: 'پیگیری درخواست' },
  { id: 'login', label: 'ورود' },
]

const COMPLEX_SUB_TABS = [
  { id: 'request', label: 'عضویت و رمز' },
  { id: 'list', label: 'پیگیری درخواست' },
  { id: 'login', label: 'ورود' },
]

const STATUS_STYLE = {
  'دریافت شده': 'status-received',
  'در حال بررسی': 'status-review',
  'تایید شده': 'status-approved',
  'تایید نشده': 'status-rejected',
}

const emptyRegister = {
  block_number: '۷',
  block_direction: 'شرقی',
  unit_name: '',
  floor: '',
  occupancy: 'مالک',
  people_count: '1',
  first_name: '',
  last_name: '',
  phone: '',
  pin: '',
}

const emptyMembership = { ...emptyRegister }

const emptyComplex = {
  complex_name: '',
  blocks_count: '',
  units_count: '',
  address: '',
  first_name: '',
  last_name: '',
  national_id: '',
  phone: '',
  password: '',
}

export default function AuthPage() {
  const navigate = useNavigate()
  const [shareNext, setShareNext] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('next') || ''
    } catch {
      return ''
    }
  })

  // هدایت پس از اشتراک‌گذاری از اپ پرداخت
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const next = params.get('next') || ''
    setShareNext(next)
    const session = getSession()
    if (next === 'share-receipt' && session?.type === 'resident') {
      navigate('/panel?tab=bills&share=1', { replace: true })
      return
    }
    if (
      (next === 'share-expense' || next === 'share-choose') &&
      session?.type === 'admin' &&
      session.admin?.role === 'block_manager'
    ) {
      navigate('/block-admin?tab=block_expenses&share=1', { replace: true })
    }
  }, [navigate])

  const [mainTab, setMainTab] = useState('register')
  const [adminTab, setAdminTab] = useState('block_manager')
  const [blockSubTab, setBlockSubTab] = useState('request')
  const [complexSubTab, setComplexSubTab] = useState('request')
  const [registerForm, setRegisterForm] = useState(emptyRegister)
  const [membershipForm, setMembershipForm] = useState(emptyMembership)
  const [complexForm, setComplexForm] = useState(emptyComplex)
  const [units, setUnits] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [complexRequests, setComplexRequests] = useState<any[]>([])
  const [userLogin, setUserLogin] = useState({ unit_name: '', pin: '' })
  const [userMode, setUserMode] = useState('login') // login | forgot
  const [forgotForm, setForgotForm] = useState({
    unit_name: '',
    first_name: '',
    last_name: '',
    phone: '',
    new_pin: '',
    confirm_pin: '',
  })
  const [adminLogin, setAdminLogin] = useState({ username: '', password: '' })
  const [blockLogin, setBlockLogin] = useState({
    block_number: '۷',
    block_direction: 'شرقی',
    password: '',
  })
  const [complexLogin, setComplexLogin] = useState({ complex_name: '', password: '' })
  const [boardLogin, setBoardLogin] = useState({
    complex_name: '',
    phone: '',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [complexRequestsLoading, setComplexRequestsLoading] = useState(false)
  const [error, setError] = useState(() => {
    try {
      const r = new URLSearchParams(window.location.search).get('reason')
      if (r === 'replaced') return 'این حساب از دستگاه دیگری وارد شده است. لطفاً دوباره وارد شوید.'
      if (r === 'expired' || r === 'revoked') return 'نشست شما به پایان رسید. دوباره وارد شوید.'
    } catch {
      /* ignore */
    }
    return ''
  })
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const session = getSession()
    if (session?.type === 'resident') navigate('/panel', { replace: true })
    if (session?.type === 'admin') {
      if (session.admin?.role === 'block_manager') navigate('/block-admin', { replace: true })
      else if (session.admin?.role === 'complex_manager') navigate('/complex-admin', { replace: true })
      else if (session.admin?.role === 'board_member') navigate('/board-admin', { replace: true })
      else navigate('/admin', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    if (mainTab === 'user') loadUnits()
  }, [mainTab])

  useEffect(() => {
    if (mainTab === 'admin' && adminTab === 'block_manager' && blockSubTab === 'list') {
      loadRequests()
    }
  }, [mainTab, adminTab, blockSubTab])

  useEffect(() => {
    if (mainTab === 'admin' && adminTab === 'complex_manager' && complexSubTab === 'list') {
      loadComplexRequests()
    }
  }, [mainTab, adminTab, complexSubTab])

  const loadUnits = async () => {
    setUnitsLoading(true)
    try {
      const res = await fetch('/api/residents?units=1')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت واحدها')
      setUnits(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'خطا در دریافت واحدها')
    } finally {
      setUnitsLoading(false)
    }
  }

  const loadRequests = async () => {
    setRequestsLoading(true)
    setError('')
    try {
      const res = await fetch('/api/membership-requests')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت درخواست‌ها')
      setRequests(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'خطا در دریافت درخواست‌ها')
    } finally {
      setRequestsLoading(false)
    }
  }

  const loadComplexRequests = async () => {
    setComplexRequestsLoading(true)
    setError('')
    try {
      const res = await fetch('/api/complex-requests')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت درخواست‌های مجتمع')
      setComplexRequests(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'خطا در دریافت درخواست‌های مجتمع')
    } finally {
      setComplexRequestsLoading(false)
    }
  }

  const setReg = (key, value) => setRegisterForm((prev) => ({ ...prev, [key]: value }))
  const setMem = (key, value) => setMembershipForm((prev) => ({ ...prev, [key]: value }))
  const setCx = (key, value) => setComplexForm((prev) => ({ ...prev, [key]: value }))

  const switchMain = (id) => {
    setMainTab(id)
    setError('')
    setSuccess('')
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const pin = toEnglishDigits(registerForm.pin).trim()
    if (pin.length < 4) {
      setError('رمز باید حداقل ۴ کاراکتر باشد')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...registerForm,
          phone: toEnglishDigits(registerForm.phone),
          pin,
          block_number: toEnglishDigits(registerForm.block_number),
          floor: toEnglishDigits(registerForm.floor),
          people_count: toEnglishDigits(registerForm.people_count),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ثبت‌نام ناموفق بود')
      setSuccess('ثبت‌نام با موفقیت انجام شد. اکنون می‌توانید وارد شوید.')
      setRegisterForm(emptyRegister)
      setUserLogin({ unit_name: data.unit_name, pin: '' })
      setTimeout(() => setMainTab('user'), 700)
    } catch (err) {
      setError(err.message || 'خطا در ثبت‌نام')
    } finally {
      setLoading(false)
    }
  }

  const handleMembershipRequest = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const pin = toEnglishDigits(membershipForm.pin).trim()
    if (pin.length < 4) {
      setError('رمز باید حداقل ۴ کاراکتر باشد')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/membership-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...membershipForm,
          phone: toEnglishDigits(membershipForm.phone),
          pin,
          block_number: toEnglishDigits(membershipForm.block_number),
          floor: toEnglishDigits(membershipForm.floor),
          people_count: toEnglishDigits(membershipForm.people_count),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ارسال درخواست ناموفق بود')
      setSuccess('درخواست عضویت برای تایید به مدیر مجتمع ارسال شد.')
      setMembershipForm(emptyMembership)
      setBlockSubTab('list')
      loadRequests()
    } catch (err) {
      setError(err.message || 'خطا در ارسال درخواست')
    } finally {
      setLoading(false)
    }
  }

  const handleComplexRequest = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/complex-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...complexForm,
          blocks_count: toEnglishDigits(complexForm.blocks_count),
          units_count: toEnglishDigits(complexForm.units_count),
          national_id: toEnglishDigits(complexForm.national_id),
          phone: toEnglishDigits(complexForm.phone),
          password: toEnglishDigits(complexForm.password),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ارسال درخواست مجتمع ناموفق بود')
      setSuccess('درخواست مجتمع برای تایید به مدیر سیستم ارسال شد.')
      setComplexForm(emptyComplex)
      setComplexSubTab('list')
      loadComplexRequests()
    } catch (err) {
      setError(err.message || 'خطا در ارسال درخواست مجتمع')
    } finally {
      setLoading(false)
    }
  }

  const handleUserLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const loginPin = toEnglishDigits(userLogin.pin).trim()
    if (!loginPin || loginPin.length < 4) {
      setError('رمز باید حداقل ۴ کاراکتر باشد')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth-resident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userLogin, pin: loginPin }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ورود ناموفق بود')
      saveSession({ type: 'resident', token: data.token, expires_at: data.expires_at, user: data.user })
      // اگر از اشتراک‌گذاری آمده باشد → مستقیم تب رسید
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next')
      if (next === 'share-receipt' || next === 'share-choose') {
        navigate('/panel?tab=bills&share=1', { replace: true })
      } else {
        navigate('/panel')
      }
    } catch (err) {
      setError(err.message || 'خطا در ورود')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const newPin = toEnglishDigits(forgotForm.new_pin).trim()
    const confirmPin = toEnglishDigits(forgotForm.confirm_pin).trim()
    if (newPin.length < 4) {
      setError('رمز جدید باید حداقل ۴ کاراکتر باشد')
      return
    }
    if (newPin !== confirmPin) {
      setError('رمز جدید و تکرار آن یکسان نیست')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/resident-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'forgot',
          ...forgotForm,
          phone: toEnglishDigits(forgotForm.phone),
          new_pin: newPin,
          confirm_pin: confirmPin,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'بازیابی رمز ناموفق بود')
      setSuccess(data.message || 'رمز جدید ثبت شد. اکنون وارد شوید.')
      setUserLogin({ unit_name: data.unit_name || forgotForm.unit_name, pin: '' })
      setForgotForm({
        unit_name: '',
        first_name: '',
        last_name: '',
        phone: '',
        new_pin: '',
        confirm_pin: '',
      })
      setUserMode('login')
    } catch (err) {
      setError(err.message || 'خطا در بازیابی رمز')
    } finally {
      setLoading(false)
    }
  }

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...adminLogin, role: 'system_admin' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ورود مدیر ناموفق بود')
      saveSession({ type: 'admin', token: data.token, expires_at: data.expires_at, admin: data.admin })
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'خطا در ورود مدیر')
    } finally {
      setLoading(false)
    }
  }

  const handleBlockManagerLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth-block-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...blockLogin,
          block_number: toEnglishDigits(blockLogin.block_number),
          password: toEnglishDigits(blockLogin.password),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ورود مدیر بلوک ناموفق بود')
      saveSession({ type: 'admin', token: data.token, expires_at: data.expires_at, admin: data.admin })
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next')
      if (next === 'share-expense' || next === 'share-choose') {
        navigate('/block-admin?tab=block_expenses&share=1', { replace: true })
      } else {
        navigate('/block-admin')
      }
    } catch (err) {
      setError(err.message || 'خطا در ورود مدیر بلوک')
    } finally {
      setLoading(false)
    }
  }

  const handleComplexManagerLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth-complex-manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(complexLogin),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ورود مدیر مجتمع ناموفق بود')
      saveSession({
        type: 'admin',
        token: data.token,
        expires_at: data.expires_at,
        admin: { ...data.admin, role: data.admin?.role || 'complex_manager' },
      })
      navigate('/complex-admin')
    } catch (err) {
      setError(err.message || 'خطا در ورود مدیر مجتمع')
    } finally {
      setLoading(false)
    }
  }

  const handleBoardLogin = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth-board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complex_name: boardLogin.complex_name,
          phone: toEnglishDigits(boardLogin.phone),
          password: toEnglishDigits(boardLogin.password),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ورود هیئت مدیره ناموفق بود')
      saveSession({
        type: 'admin',
        token: data.token,
        expires_at: data.expires_at,
        admin: { ...data.admin, role: data.admin?.role || 'board_member' },
      })
      navigate('/board-admin')
    } catch (err) {
      setError(err.message || 'خطا در ورود هیئت مدیره')
    } finally {
      setLoading(false)
    }
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

  return (
    <div className="auth-page" dir="rtl">
      <div className="auth-page-inner">
        {(shareNext === 'share-choose' || shareNext === 'share-expense' || shareNext === 'share-receipt') && (
        <div className="warn-box">
            <p className="font-black mb-1">فایل از اپ پرداخت دریافت شد</p>
            {shareNext === 'share-expense' ? (
              <p>برای پیوست به فاکتور خرج‌کرد، با نقش <strong>مدیر بلوک</strong> وارد شوید.</p>
            ) : shareNext === 'share-receipt' ? (
              <p>برای ارسال رسید، با نقش <strong>ساکن</strong> وارد شوید.</p>
            ) : (
              <p>
                اگر <strong>ساکن</strong> هستید از «ورود ساکنین» وارد شوید (بخش رسید).
                <br />
                اگر <strong>مدیر بلوک</strong> هستید از «مدیر بلوک» وارد شوید (خرج‌کرد و پیوست فاکتور).
              </p>
            )}
          </div>
        )}
        <div className="auth-heading">
          <h1 className="page-title">بلوک هفت شرقی</h1>
        </div>

        <div className="auth-card">
          <div className="auth-card-header">
            {MAIN_TABS.map((tab) => {
              const active = mainTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchMain(tab.id)}
                  className={active ? 'auth-tab auth-tab-active' : 'auth-tab'}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="auth-card-body">
            {(error || success) && (
              <div className={error ? 'msg-error' : 'msg-success'}>
                {error || success}
              </div>
            )}

            <>
              {mainTab === 'register' && (
                <form
                  onSubmit={handleRegister}
                  className="space-y-3.5"
                >
                  <RegisterFields form={registerForm} setField={setReg} />
                  <button type="submit" disabled={loading} className="btn-primary">
                    {loading ? 'در حال ثبت...' : 'ثبت نام'}
                  </button>
                </form>
              )}

              {mainTab === 'user' && (
                <div className="space-y-3.5">
                  <div className="auth-card-header" style={{ borderBottom: 0, padding: '0 0 8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMode('login')
                        setError('')
                        setSuccess('')
                      }}
                      className={userMode === 'login' ? 'auth-tab auth-tab-active' : 'auth-tab'}
                    >
                      ورود ساکن
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMode('forgot')
                        setError('')
                        setSuccess('')
                      }}
                      className={userMode === 'forgot' ? 'auth-tab auth-tab-active' : 'auth-tab'}
                    >
                      فراموشی رمز
                    </button>
                  </div>

                  {userMode === 'login' ? (
                    <form onSubmit={handleUserLogin} className="space-y-3.5">
                      <Field label="نام واحد">
                        {unitsLoading ? (
                          <div className="text-sm text-slate-600 font-semibold py-3">در حال بارگذاری واحدها...</div>
                        ) : (
                          <select
                            value={userLogin.unit_name}
                            onChange={(e) => setUserLogin((p) => ({ ...p, unit_name: e.target.value }))}
                            className="field-input"
                            required
                          >
                            <option value="">انتخاب نام واحد</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.unit_name}>
                                {u.unit_name} — طبقه {u.floor}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>

                      <Field label="رمز ورود (حداقل ۴ کاراکتر)">
                        <input
                          type="password"
                          value={userLogin.pin}
                          onChange={(e) => setUserLogin((p) => ({ ...p, pin: toEnglishDigits(e.target.value) }))}
                          className="field-input dir-ltr"
                          placeholder="حداقل ۴ کاراکتر"
                          minLength={4}
                          required
                        />
                      </Field>

                      {units.length === 0 && !unitsLoading && (
                        <p className="warn-box">
                          هنوز واحدی ثبت نشده است. ابتدا از تب «ثبت نام ساکنین» اقدام کنید یا منتظر تایید مدیر
                          مجتمع بمانید.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setUserMode('forgot')
                          setError('')
                          setSuccess('')
                          setForgotForm((p) => ({ ...p, unit_name: userLogin.unit_name || '' }))
                        }}
                        className="text-xs font-bold text-slate-700 underline"
                      >
                        رمز را فراموش کرده‌ام
                      </button>

                      <button type="submit" disabled={loading || unitsLoading} className="btn-primary">
                        {loading ? 'در حال ورود...' : 'ورود به پنل کاربر'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleForgotPin} className="space-y-3.5">
                      <p className="hint-box">
                        برای بازیابی رمز، اطلاعات هویتی ثبت‌شده هنگام عضویت را وارد کنید و رمز جدید بسازید.
                      </p>
                      <Field label="نام واحد">
                        {unitsLoading ? (
                          <div className="text-sm text-slate-600 font-semibold py-3">در حال بارگذاری...</div>
                        ) : (
                          <select
                            value={forgotForm.unit_name}
                            onChange={(e) => setForgotForm((p) => ({ ...p, unit_name: e.target.value }))}
                            className="field-input"
                            required
                          >
                            <option value="">انتخاب نام واحد</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.unit_name}>
                                {u.unit_name}
                              </option>
                            ))}
                          </select>
                        )}
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="نام">
                          <input
                            value={forgotForm.first_name}
                            onChange={(e) => setForgotForm((p) => ({ ...p, first_name: e.target.value }))}
                            className="field-input"
                            required
                          />
                        </Field>
                        <Field label="نام خانوادگی">
                          <input
                            value={forgotForm.last_name}
                            onChange={(e) => setForgotForm((p) => ({ ...p, last_name: e.target.value }))}
                            className="field-input"
                            required
                          />
                        </Field>
                      </div>
                      <Field label="شماره تماس ثبت‌شده">
                        <input
                          value={forgotForm.phone}
                          onChange={(e) => setForgotForm((p) => ({ ...p, phone: toEnglishDigits(e.target.value) }))}
                          className="field-input dir-ltr"
                          placeholder="0912..."
                          required
                        />
                      </Field>
                      <Field label="رمز جدید (حداقل ۴ کاراکتر)">
                        <input
                          type="password"
                          value={forgotForm.new_pin}
                          onChange={(e) => setForgotForm((p) => ({ ...p, new_pin: toEnglishDigits(e.target.value) }))}
                          className="field-input dir-ltr"
                          minLength={4}
                          required
                        />
                      </Field>
                      <Field label="تکرار رمز جدید">
                        <input
                          type="password"
                          value={forgotForm.confirm_pin}
                          onChange={(e) => setForgotForm((p) => ({ ...p, confirm_pin: toEnglishDigits(e.target.value) }))}
                          className="field-input dir-ltr"
                          minLength={4}
                          required
                        />
                      </Field>
                      <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? 'در حال ثبت...' : 'ثبت رمز جدید و بازگشت به ورود'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {mainTab === 'admin' && (
                <div className="space-y-4">
                  <div className="auth-card-header" style={{ borderBottom: 0, padding: '0 0 8px' }}>
                    {ADMIN_TABS.map((tab) => {
                      const active = adminTab === tab.id
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setAdminTab(tab.id)
                            setError('')
                            setSuccess('')
                            setAdminLogin({ username: '', password: '' })
                            if (tab.id === 'block_manager') setBlockSubTab('request')
                            if (tab.id === 'complex_manager') setComplexSubTab('request')
                          }}
                          className={active ? 'auth-tab auth-tab-active' : 'auth-tab'}
                        >
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>

                  {adminTab === 'block_manager' && (
                    <div className="space-y-4">
                      <LinearSubTabs
                        tabs={BLOCK_SUB_TABS}
                        active={blockSubTab}
                        onChange={(id) => {
                          setBlockSubTab(id)
                          setError('')
                          setSuccess('')
                        }}
                      />

                      <>
                        {blockSubTab === 'request' && (
                          <form onSubmit={handleMembershipRequest} className="space-y-3.5">
                            <p className="hint-box">
                              این درخواست پس از ارسال برای <strong>تایید مدیر مجتمع</strong> ارسال می‌شود.
                              ورود کاربر فقط پس از «تایید شده» امکان‌پذیر است.
                            </p>
                            <RegisterFields form={membershipForm} setField={setMem} />
                            <button type="submit" disabled={loading} className="btn-admin">
                              {loading ? 'در حال ارسال...' : 'ارسال درخواست به مدیر مجتمع'}
                            </button>
                          </form>
                        )}

                        {blockSubTab === 'list' && (
                          <div className="space-y-3">
                            <RequestTable
                              title="پیگیری درخواست"
                              loading={requestsLoading}
                              onRefresh={loadRequests}
                              emptyText="هنوز درخواستی ثبت نشده است."
                              headers={['نام', 'نام خانوادگی', 'نفرات', 'تاریخ درخواست', 'وضعیت درخواست']}
                              rows={requests.map((r) => [
                                r.first_name,
                                r.last_name,
                                r.people_count != null
                                  ? `${Number(r.people_count).toLocaleString('fa-IR')} نفر`
                                  : '—',
                                formatDate(r.created_at),
                                r.status,
                              ])}
                            />
                          </div>
                        )}

                        {blockSubTab === 'login' && (
                          <form onSubmit={handleBlockManagerLogin} className="space-y-3.5">
                            <Field label="شماره بلوک">
                              <select
                                value={blockLogin.block_number}
                                onChange={(e) =>
                                  setBlockLogin((p) => ({ ...p, block_number: e.target.value }))
                                }
                                className="field-input"
                                required
                              >
                                <option value="۷">۷</option>
                                <option value="۶">۶</option>
                                <option value="۸">۸</option>
                              </select>
                            </Field>

                            <Field label="جهت بلوک">
                              <select
                                value={blockLogin.block_direction}
                                onChange={(e) =>
                                  setBlockLogin((p) => ({ ...p, block_direction: e.target.value }))
                                }
                                className="field-input"
                                required
                              >
                                <option value="شرقی">شرقی</option>
                                <option value="غربی">غربی</option>
                              </select>
                            </Field>

                            <Field label="رمز مدیر بلوک">
                              <input
                                type="password"
                                value={blockLogin.password}
                                onChange={(e) =>
                                  setBlockLogin((p) => ({ ...p, password: e.target.value }))
                                }
                                className="field-input dir-ltr"
                                placeholder="••••"
                                required
                              />
                            </Field>

                            <div className="hint-box">
                              نمونه ورود مدیر بلوک هفت شرقی:{' '}
                              <span className="hint-cred dir-ltr inline-block">۷ / شرقی / 1234</span>
                              <span className="block mt-1 text-[10px] font-bold text-slate-600">رمز اولیه مدیر بلوک هفت شرقی: 1234</span>
                            </div>

                            <button type="submit" disabled={loading} className="btn-admin">
                              {loading ? 'در حال ورود...' : 'ورود به پنل مدیر بلوک'}
                            </button>
                          </form>
                        )}
                      </>
                    </div>
                  )}

                  {adminTab === 'complex_manager' && (
                    <div className="space-y-4">
                      <LinearSubTabs
                        tabs={COMPLEX_SUB_TABS}
                        active={complexSubTab}
                        
                        onChange={(id) => {
                          setComplexSubTab(id)
                          setError('')
                          setSuccess('')
                        }}
                      />

                      <>
                        {complexSubTab === 'request' && (
                          <form onSubmit={handleComplexRequest} className="space-y-3.5">
                            <p className="hint-box">
                              این درخواست پس از ارسال برای <strong>تایید مدیر سیستم</strong> ارسال می‌شود.
                              ورود مدیر مجتمع فقط پس از «تایید شده» امکان‌پذیر است.
                            </p>

                            <Field label="نام مجتمع">
                              <input
                                value={complexForm.complex_name}
                                onChange={(e) => setCx('complex_name', e.target.value)}
                                className="field-input"
                                placeholder="مثلاً مجتمع آسمان"
                                required
                              />
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                              <Field label="تعداد بلوک‌ها">
                                <input
                                  value={complexForm.blocks_count}
                                  onChange={(e) => setCx('blocks_count', e.target.value)}
                                  className="field-input dir-ltr"
                                  placeholder="مثلاً 8"
                                  required
                                />
                              </Field>
                              <Field label="تعداد واحدها">
                                <input
                                  value={complexForm.units_count}
                                  onChange={(e) => setCx('units_count', e.target.value)}
                                  className="field-input dir-ltr"
                                  placeholder="مثلاً 120"
                                  required
                                />
                              </Field>
                            </div>

                            <Field label="آدرس مجتمع">
                              <textarea
                                value={complexForm.address}
                                onChange={(e) => setCx('address', e.target.value)}
                                className="field-input min-h-[88px] resize-y"
                                placeholder="آدرس کامل مجتمع"
                                required
                              />
                            </Field>

                            <div className="warn-box">
                              <p className="field-label text-xs !mb-0">مشخصات درخواست‌کننده</p>
                              <div className="grid grid-cols-2 gap-3">
                                <Field label="نام">
                                  <input
                                    value={complexForm.first_name}
                                    onChange={(e) => setCx('first_name', e.target.value)}
                                    className="field-input"
                                    required
                                  />
                                </Field>
                                <Field label="نام خانوادگی">
                                  <input
                                    value={complexForm.last_name}
                                    onChange={(e) => setCx('last_name', e.target.value)}
                                    className="field-input"
                                    required
                                  />
                                </Field>
                              </div>
                              <Field label="کد ملی">
                                <input
                                  value={complexForm.national_id}
                                  onChange={(e) => {
                                    const v = e.target.value.replace(/\D/g, '').slice(0, 10)
                                    setCx('national_id', v)
                                  }}
                                  className="field-input dir-ltr"
                                  placeholder="0012345678"
                                  inputMode="numeric"
                                  maxLength={10}
                                  required
                                />
                              </Field>
                              <Field label="شماره تماس">
                                <input
                                  value={complexForm.phone}
                                  onChange={(e) => setCx('phone', e.target.value)}
                                  className="field-input dir-ltr"
                                  placeholder="0912..."
                                  required
                                />
                              </Field>
                            </div>

                            <Field label="رمز عبور مدیر مجتمع">
                              <input
                                type="password"
                                value={complexForm.password}
                                onChange={(e) => setCx('password', e.target.value)}
                                className="field-input dir-ltr"
                                placeholder="حداقل ۴ کاراکتر"
                                required
                              />
                            </Field>

                            <button type="submit" disabled={loading} className="btn-admin">
                              {loading ? 'در حال ارسال...' : 'ارسال درخواست به مدیر سیستم'}
                            </button>
                          </form>
                        )}

                        {complexSubTab === 'list' && (
                          <div className="space-y-3">
                            <RequestTable
                              title="پیگیری درخواست"
                              loading={complexRequestsLoading}
                              onRefresh={loadComplexRequests}
                              emptyText="هنوز درخواست مجتمعی ثبت نشده است."
                              headers={['نام', 'نام خانوادگی', 'تاریخ درخواست', 'وضعیت درخواست']}
                              rows={complexRequests.map((r) => [
                                r.first_name || '—',
                                r.last_name || '—',
                                formatDate(r.created_at),
                                r.status,
                              ])}
                            />
                          </div>
                        )}

                        {complexSubTab === 'login' && (
                          <form onSubmit={handleComplexManagerLogin} className="space-y-3.5">
                            <Field label="نام مجتمع">
                              <input
                                value={complexLogin.complex_name}
                                onChange={(e) =>
                                  setComplexLogin((p) => ({ ...p, complex_name: e.target.value }))
                                }
                                className="field-input"
                                placeholder="نام مجتمع تاییدشده"
                                required
                              />
                            </Field>

                            <Field label="رمز عبور">
                              <input
                                type="password"
                                value={complexLogin.password}
                                onChange={(e) =>
                                  setComplexLogin((p) => ({ ...p, password: e.target.value }))
                                }
                                className="field-input dir-ltr"
                                placeholder="••••"
                                required
                              />
                            </Field>

                            <div className="hint-box">
                              نمونه ورود مدیر مجتمع تاییدشده:{' '}
                              <span className="hint-cred dir-ltr inline-block">مجتمع نمونه / modirmo</span>
                            </div>

                            <button type="submit" disabled={loading} className="btn-admin">
                              {loading ? 'در حال ورود...' : 'ورود به پنل مدیر مجتمع'}
                            </button>
                          </form>
                        )}
                      </>
                    </div>
                  )}

                  {adminTab === 'board_member' && (
                    <form onSubmit={handleBoardLogin} className="space-y-3.5">
                      <Field label="نام مجتمع">
                        <input
                          value={boardLogin.complex_name}
                          onChange={(e) =>
                            setBoardLogin((p) => ({ ...p, complex_name: e.target.value }))
                          }
                          className="field-input"
                          placeholder="مثلاً مجتمع نمونه"
                          required
                        />
                      </Field>
                      <Field label="شماره تماس ثبت‌شده">
                        <input
                          value={boardLogin.phone}
                          onChange={(e) =>
                            setBoardLogin((p) => ({
                              ...p,
                              phone: toEnglishDigits(e.target.value),
                            }))
                          }
                          className="field-input dir-ltr"
                          placeholder="0912..."
                          required
                        />
                      </Field>
                      <Field label="رمز ورود">
                        <input
                          type="password"
                          value={boardLogin.password}
                          onChange={(e) =>
                            setBoardLogin((p) => ({
                              ...p,
                              password: toEnglishDigits(e.target.value),
                            }))
                          }
                          className="field-input dir-ltr"
                          placeholder="رمز تعیین‌شده توسط مدیر مجتمع"
                          required
                        />
                      </Field>
                      <div className="hint-box">
                        اعضای هیئت مدیره را مدیر مجتمع ثبت می‌کند و دسترسی هر سمت (مالی، تأسیسات، برقکار و …)
                        را تعیین می‌کند.
                      </div>
                      <button type="submit" disabled={loading} className="btn-admin">
                        {loading ? 'در حال ورود...' : 'ورود به پنل هیئت مدیره'}
                      </button>
                    </form>
                  )}

                  {adminTab === 'system_admin' && (
                    <form onSubmit={handleAdminLogin} className="space-y-3.5">
                      <Field label="نام کاربری">
                        <input
                          value={adminLogin.username}
                          onChange={(e) => setAdminLogin((p) => ({ ...p, username: e.target.value }))}
                          className="field-input dir-ltr"
                          placeholder="username"
                          required
                        />
                      </Field>
                      <Field label="رمز عبور">
                        <input
                          type="password"
                          value={adminLogin.password}
                          onChange={(e) => setAdminLogin((p) => ({ ...p, password: e.target.value }))}
                          className="field-input dir-ltr"
                          placeholder="••••"
                          required
                        />
                      </Field>

                      <div className="hint-box">
                        نمونه مدیر سیستم:{' '}
                        <span className="hint-cred dir-ltr inline-block">sysadmin / modirse</span>
                      </div>

                      <button type="submit" disabled={loading} className="btn-admin">
                        {loading ? 'در حال ورود...' : 'ورود مدیر سیستم'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinearSubTabs({ tabs, active, onChange }) {
  return (
    <div className="auth-card-header" style={{ borderBottom: 0, padding: '0 0 8px' }}>
      {tabs.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={isActive ? 'auth-tab auth-tab-active' : 'auth-tab'}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function RequestTable({ title, loading, onRefresh, emptyText, headers, rows, note = '' }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="field-label text-sm">{title}</h3>
        <button type="button" onClick={onRefresh} className="btn-ghost !py-2 !px-3 text-xs">
          بروزرسانی
        </button>
      </div>

      {note && <p className="text-[11px] text-slate-500 font-semibold">{note}</p>}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-9 h-9 border-4 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="warn-box text-center">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto" style={{ border: '1px solid #d1d5db' }}>
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700 text-right">
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-t border-slate-100 bg-white">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2.5 font-semibold text-slate-800">
                      {cIdx === row.length - 1 ? (
                        <span className={`status-badge ${STATUS_STYLE[cell] || ''}`}>{cell}</span>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RegisterFields({ form, setField }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="شماره بلوک">
          <input
            value={form.block_number}
            onChange={(e) => setField('block_number', e.target.value)}
            className="field-input"
            placeholder="۷"
            required
          />
        </Field>
        <Field label="جهت بلوک">
          <select
            value={form.block_direction}
            onChange={(e) => setField('block_direction', e.target.value)}
            className="field-input"
            required
          >
            <option value="شرقی">شرقی</option>
            <option value="غربی">غربی</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="نام واحد">
          <input
            value={form.unit_name}
            onChange={(e) => setField('unit_name', e.target.value)}
            className="field-input"
            placeholder="مثلاً A-12"
            required
          />
        </Field>
        <Field label="طبقه">
          <input
            value={form.floor}
            onChange={(e) => setField('floor', e.target.value)}
            className="field-input"
            placeholder="مثلاً ۳"
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="مالک یا مستاجر">
          <select
            value={form.occupancy}
            onChange={(e) => setField('occupancy', e.target.value)}
            className="field-input"
            required
          >
            <option value="مالک">مالک</option>
            <option value="مستاجر">مستاجر</option>
          </select>
        </Field>
        <Field label="تعداد نفرات واحد">
          <input
            value={form.people_count}
            onChange={(e) => setField('people_count', toEnglishDigits(e.target.value))}
            className="field-input dir-ltr"
            placeholder="مثلاً 4"
            inputMode="numeric"
            min={1}
            max={50}
            required
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="نام">
          <input
            value={form.first_name}
            onChange={(e) => setField('first_name', e.target.value)}
            className="field-input"
            required
          />
        </Field>
        <Field label="نام خانوادگی">
          <input
            value={form.last_name}
            onChange={(e) => setField('last_name', e.target.value)}
            className="field-input"
            required
          />
        </Field>
      </div>

      <Field label="شماره تماس">
        <input
          value={form.phone}
          onChange={(e) => setField('phone', toEnglishDigits(e.target.value))}
          className="field-input dir-ltr"
          placeholder="0912... یا ۰۹۱۲..."
          required
        />
      </Field>

      <Field label="رمز ورود (حداقل ۴ کاراکتر — فارسی/انگلیسی یکسان)">
        <input
          type="password"
          value={form.pin}
          onChange={(e) => setField('pin', toEnglishDigits(e.target.value))}
          className="field-input dir-ltr"
          placeholder="حداقل ۴ کاراکتر"
          minLength={4}
          maxLength={32}
          required
        />
      </Field>
    </>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}
