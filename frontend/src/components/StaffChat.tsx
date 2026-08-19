import { useEffect, useRef, useState } from 'react'
import { MessageSquare, Send, AlertCircle, Mic, Square, ArrowDown } from 'lucide-react'

const MAX_VOICE_SECONDS = 20
const NEAR_BOTTOM_PX = 80

export default function StaffChat({
  block_number,
  block_direction,
  sender_role = 'block_manager',
  sender_name = 'مدیر بلوک',
  channel = '',
  complex_name = '',
  title = '',
}: {
  block_number?: string
  block_direction?: string
  sender_role?: string
  sender_name?: string
  channel?: string
  complex_name?: string
  title?: string
}) {
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [showJump, setShowJump] = useState(false)
  const listRef = useRef(null)
  const stickRef = useRef(true)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef(null)
  const streamRef = useRef(null)

  const isNearBottom = () => {
    const el = listRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    stickRef.current = true
    setShowJump(false)
  }

  const channelPayload = () => {
    if (channel === 'system_complex') {
      return {
        channel: 'system_complex',
        complex_name: complex_name || block_direction || 'all',
        block_number: '__SYSTEM__',
        block_direction: complex_name || block_direction || 'all',
      }
    }
    return { block_number, block_direction }
  }

  const load = async (forceBottom = false) => {
    try {
      const base = channelPayload()
      const q = new URLSearchParams()
      if (base.channel) {
        q.set('channel', base.channel)
        q.set('complex_name', base.complex_name)
      } else {
        q.set('block_number', base.block_number)
        q.set('block_direction', base.block_direction)
      }
      const res = await fetch(`/api/staff-chat?${q.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت گفتگو')
      setMessages(Array.isArray(data) ? data : [])
      requestAnimationFrame(() => {
        if (forceBottom || stickRef.current) scrollToBottom(true)
        else setShowJump(true)
      })
    } catch (err) {
      setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
    const t = setInterval(() => load(false), 15000)
    return () => {
      clearInterval(t)
      if (streamRef.current) streamRef.current.getTracks().forEach((x) => x.stop())
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block_number, block_direction, channel, complex_name])

  const sendText = async (e) => {
    e?.preventDefault?.()
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/staff-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...channelPayload(),
          sender_role,
          sender_name,
          message: text.trim(),
          message_type: 'text',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ارسال ناموفق')
      setText('')
      stickRef.current = true
      await load(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        resolve(result.includes(',') ? result.split(',')[1] : result)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      })
      streamRef.current = stream
      chunksRef.current = []
      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      const mime = mimeCandidates.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || ''
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (ev) => {
        if (ev.data?.size) chunksRef.current.push(ev.data)
      }
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size < 200) throw new Error('ضبط نامعتبر بود')
          if (blob.size > 320000) throw new Error('حجم صوت زیاد است')
          setSending(true)
          const base64 = await blobToBase64(blob)
          const res = await fetch('/api/staff-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...channelPayload(),
              sender_role,
              sender_name,
              message_type: 'voice',
              message: '🎤 پیام صوتی',
              audio_base64: base64,
              audio_mime: blob.type || 'audio/webm',
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'ارسال صوت ناموفق')
          stickRef.current = true
          await load(true)
        } catch (err) {
          setError(err.message)
        } finally {
          setSending(false)
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((x) => x.stop())
            streamRef.current = null
          }
        }
      }
      recorder.start(250)
      setRecording(true)
      setRecordSecs(0)
      timerRef.current = setInterval(() => {
        setRecordSecs((s) => {
          const n = s + 1
          if (n >= MAX_VOICE_SECONDS) stopRecording()
          return n
        })
      }, 1000)
    } catch (err) {
      setError(err.message || 'دسترسی میکروفون ممکن نشد')
    }
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setRecording(false)
    const rec = mediaRecorderRef.current
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop()
      } catch {}
    }
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleString('fa-IR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-indigo-600" />
        <h2 className="panel-title text-lg">
          {title ||
            (channel === 'system_complex'
              ? 'ارتباط مدیر سیستم ↔ مدیر مجتمع'
              : 'ارتباط با مدیر مجتمع')}
        </h2>
      </div>
      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="panel-card rounded-2xl overflow-hidden flex flex-col h-[min(58dvh,420px)] relative">
        <div
          ref={listRef}
          onScroll={() => {
            const near = isNearBottom()
            stickRef.current = near
            setShowJump(!near)
          }}
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/70"
        >
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-slate-500 font-semibold py-10 text-sm">هنوز پیامی نیست</p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_role === sender_role
              const isVoice = m.message_type === 'voice' && m.audio_url
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm font-semibold shadow-sm ${
                      mine
                        ? 'bg-violet-600 text-white rounded-br-md'
                        : 'bg-white text-slate-900 border border-slate-200 rounded-bl-md'
                    }`}
                  >
                    <p className={`text-[10px] mb-1 ${mine ? 'text-violet-100' : 'text-indigo-700'}`}>{m.sender_name}</p>
                    {isVoice ? (
                      <div className="space-y-1.5">
                        <audio controls preload="none" src={m.audio_url} className="w-full max-w-[240px] h-9" />
                        <p className={`text-[11px] ${mine ? 'text-violet-100' : 'text-slate-600'}`}>{m.message || 'پیام صوتی'}</p>
                      </div>
                    ) : (
                      <p className="leading-6 whitespace-pre-wrap">{m.message}</p>
                    )}
                    <p className={`text-[10px] mt-1 ${mine ? 'text-violet-200' : 'text-slate-500'}`}>{formatDate(m.created_at)}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>
        {showJump && (
          <button type="button" onClick={() => scrollToBottom(true)} className="chat-jump-btn">
            <ArrowDown className="w-4 h-4" />
            رفتن به آخرین پیام
          </button>
        )}
        <form onSubmit={sendText} className="chat-compose">
          <button type="submit" disabled={sending || recording || !text.trim()} className="chat-send-btn" title="ارسال">
            <Send className="w-3.5 h-3.5" />
            <span>ارسال</span>
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="field-input !py-2 flex-1 min-w-0"
            placeholder="پیام به مدیر مجتمع..."
            disabled={recording || sending}
          />
          {!recording ? (
            <button type="button" onClick={startRecording} disabled={sending} className="chat-side-btn is-mic" title="صوت">
              <Mic className="w-3.5 h-3.5" />
              <span>صوت</span>
            </button>
          ) : (
            <button type="button" onClick={stopRecording} className="chat-side-btn is-stop">
              <Square className="w-3.5 h-3.5" />
              <span>توقف {recordSecs}s</span>
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
