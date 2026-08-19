import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangedHandler } from '../types'
import {
  MessageSquare,
  Send,
  AlertCircle,
  ArrowDown,
  Mic,
  Square,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'

const NEAR_BOTTOM_PX = 80
const MAX_VOICE_SECONDS = 20

function getPrivateReadKey(unit, reader) {
  return `block7_private_chat_last_read_${unit || 'x'}_${reader || 'r'}`
}

function loadLastReadId(unit, reader) {
  try {
    const v = localStorage.getItem(getPrivateReadKey(unit, reader))
    return v ? Number(v) : 0
  } catch {
    return 0
  }
}

function saveLastReadId(unit, reader, id) {
  try {
    localStorage.setItem(getPrivateReadKey(unit, reader), String(id || 0))
  } catch {}
}

export default function PrivateChat({
  unit_name,
  block_number,
  block_direction,
  sender_type,
  sender_name,
  title = 'ارتباط با مدیر',
  onChanged,
}: {
  unit_name?: string
  block_number?: string
  block_direction?: string
  sender_type: 'manager' | 'resident' | string
  sender_name?: string
  title?: string
  onChanged?: ChangedHandler
}) {
  const reader = sender_type === 'manager' ? 'manager' : 'resident'
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [stickToBottom, setStickToBottom] = useState(true)
  const [showJump, setShowJump] = useState(false)
  const [lastReadId, setLastReadId] = useState(() => loadLastReadId(unit_name, reader))
  const [separatorId, setSeparatorId] = useState(() => loadLastReadId(unit_name, reader))
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  const listRef = useRef(null)
  const endRef = useRef(null)
  const stickRef = useRef(true)
  const initialScrollDone = useRef(false)
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
    setStickToBottom(true)
    setShowJump(false)
  }

  const onScroll = () => {
    const near = isNearBottom()
    stickRef.current = near
    setStickToBottom(near)
    setShowJump(!near)
  }

  const markVisibleAsRead = useCallback(
    (list) => {
      if (!list?.length) return
      const maxId = Math.max(...list.map((m) => Number(m.id) || 0))
      if (maxId > 0) {
        setLastReadId(maxId)
        saveLastReadId(unit_name, reader, maxId)
      }
    },
    [unit_name, reader],
  )

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  const load = async (silent = false, opts: { forceBottom?: boolean } = {}) => {
    const forceBottom = !!opts.forceBottom
    try {
      const res = await fetch(`/api/private-chat?unit_name=${encodeURIComponent(unit_name)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'خطا در دریافت گفتگو')
      const list = Array.isArray(data) ? data : []
      setMessages(list)

      if (forceBottom || stickRef.current || !initialScrollDone.current) {
        await fetch('/api/private-chat', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unit_name, reader, action: 'mark_read' }),
        })
        markVisibleAsRead(list)
      }
      onChanged?.()

      requestAnimationFrame(() => {
        if (!initialScrollDone.current) {
          initialScrollDone.current = true
          const lr = loadLastReadId(unit_name, reader)
          const hasUnread = list.some(
            (m) => m.sender_type !== sender_type && Number(m.id) > Number(lr || 0),
          )
          if (hasUnread) {
            const el = listRef.current
            const sep = el?.querySelector?.('[data-unread-sep="1"]')
            if (sep) sep.scrollIntoView({ block: 'center', behavior: 'auto' })
            else scrollToBottom(false)
            stickRef.current = false
            setStickToBottom(false)
            setShowJump(true)
          } else {
            scrollToBottom(false)
            markVisibleAsRead(list)
          }
          return
        }
        if (forceBottom || stickRef.current) {
          scrollToBottom(true)
        } else {
          setShowJump(true)
        }
      })
    } catch (err) {
      if (!silent) setError(err.message || 'خطا')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    initialScrollDone.current = false
    const lr = loadLastReadId(unit_name, reader)
    setLastReadId(lr)
    setSeparatorId(lr)
    load()
    const t = setInterval(() => load(true), 15000)
    return () => {
      clearInterval(t)
      stopTracks()
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit_name, sender_type])

  useEffect(() => {
    if (stickToBottom && messages.length) {
      markVisibleAsRead(messages)
      const maxId = Math.max(...messages.map((m) => Number(m.id) || 0))
      if (maxId > 0) setSeparatorId(maxId)
      fetch('/api/private-chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit_name, reader, action: 'mark_read' }),
      }).catch(() => {})
    }
  }, [stickToBottom, messages, markVisibleAsRead, unit_name, reader])

  const firstUnreadIndex = useMemo(() => {
    if (!messages.length) return -1
    return messages.findIndex(
      (m) => m.sender_type !== sender_type && Number(m.id) > Number(separatorId || 0),
    )
  }, [messages, separatorId, sender_type])

  const unreadCount = useMemo(() => {
    return messages.filter(
      (m) => m.sender_type !== sender_type && Number(m.id) > Number(lastReadId || 0),
    ).length
  }, [messages, lastReadId, sender_type])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/private-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_name,
          block_number,
          block_direction,
          sender_type,
          sender_name,
          message: text.trim(),
          message_type: 'text',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'ارسال ناموفق بود')
      setText('')
      stickRef.current = true
      await load(true, { forceBottom: true })
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const readerFile = new FileReader()
      readerFile.onload = () => {
        const result = String(readerFile.result || '')
        const b64 = result.includes(',') ? result.split(',')[1] : result
        resolve(b64)
      }
      readerFile.onerror = reject
      readerFile.readAsDataURL(blob)
    })

  const startRecording = async () => {
    setError('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('مرورگر از ضبط صدا پشتیبانی نمی‌کند')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      })
      streamRef.current = stream
      chunksRef.current = []

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ]
      const mime = mimeCandidates.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || ''
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size < 200) {
            setError('ضبط نامعتبر بود. دوباره تلاش کنید.')
            return
          }
          if (blob.size > 320000) {
            setError('حجم صوت زیاد است. کوتاه‌تر ضبط کنید (حداکثر ۲۰ ثانیه).')
            return
          }
          setSending(true)
          const base64 = await blobToBase64(blob)
          const res = await fetch('/api/private-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              unit_name,
              block_number,
              block_direction,
              sender_type,
              sender_name,
              message_type: 'voice',
              message: '🎤 پیام صوتی',
              audio_base64: base64,
              audio_mime: blob.type || 'audio/webm',
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'ارسال صوت ناموفق بود')
          stickRef.current = true
          await load(true, { forceBottom: true })
          onChanged?.()
        } catch (err) {
          setError(err.message || 'خطا در ارسال صوت')
        } finally {
          setSending(false)
          stopTracks()
        }
      }

      recorder.start(250)
      setRecording(true)
      setRecordSecs(0)
      timerRef.current = setInterval(() => {
        setRecordSecs((s) => {
          const next = s + 1
          if (next >= MAX_VOICE_SECONDS) stopRecording()
          return next
        })
      }, 1000)
    } catch (err) {
      setError(err.message || 'دسترسی به میکروفون ممکن نشد')
      stopTracks()
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

  const jumpToLatest = () => {
    scrollToBottom(true)
    const maxId = messages.length ? Math.max(...messages.map((m) => Number(m.id) || 0)) : 0
    setSeparatorId(maxId)
    setLastReadId(maxId)
    saveLastReadId(unit_name, reader, maxId)
    fetch('/api/private-chat', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_name, reader, action: 'mark_read' }),
    }).catch(() => {})
  }

  const saveEdit = async (id) => {
    if (!editText.trim()) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/private-chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          id,
          unit_name,
          sender_type,
          message: editText.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'ویرایش ناموفق بود')
      setEditingId(null)
      setEditText('')
      await load(true, { forceBottom: false })
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const removeMessage = async (id) => {
    if (!confirm('این پیام حذف شود؟')) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/private-chat', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          unit_name,
          sender_type,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'حذف ناموفق بود')
      if (editingId === id) {
        setEditingId(null)
        setEditText('')
      }
      await load(true, { forceBottom: false })
      onChanged?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
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
        <h2 className="panel-title text-lg">{title}</h2>
      </div>
      <p className="text-xs text-slate-500 font-semibold">
        این گفتگو خصوصی است. می‌توانید متن یا صوت بفرستید. فقط پیام‌های خودتان قابل ویرایش و حذف است.
      </p>

      {error && (
        <div className="msg-error flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="panel-card rounded-2xl overflow-hidden flex flex-col h-[min(58dvh,420px)] relative">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/70"
        >
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-center text-slate-500 font-semibold py-10 text-sm">هنوز پیامی رد و بدل نشده</p>
          ) : (
            messages.map((m, index) => {
              const mine = m.sender_type === sender_type
              const showSep = firstUnreadIndex > 0 && index === firstUnreadIndex
              const isVoice = m.message_type === 'voice' && m.audio_url
              const isEditing = editingId === m.id
              return (
                <div key={m.id}>
                  {showSep && (
                    <div className="chat-unread-sep" role="separator" data-unread-sep="1">
                      <span>پیام‌های جدید</span>
                    </div>
                  )}
                  <div className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm font-semibold shadow-sm ${
                        mine
                          ? 'bg-violet-600 text-white rounded-br-md'
                          : 'bg-white text-slate-900 border border-slate-200 rounded-bl-md'
                      }`}
                    >
                      <p className={`text-[10px] mb-1 ${mine ? 'text-violet-100' : 'text-indigo-700'}`}>
                        {m.sender_name}
                      </p>

                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full rounded-xl border border-white/40 bg-white/95 text-slate-900 px-2 py-1.5 text-sm min-h-[64px]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveEdit(m.id)}
                              disabled={sending || !editText.trim()}
                              className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-emerald-500 text-white disabled:opacity-60"
                            >
                              <Check className="w-3.5 h-3.5" />
                              ذخیره
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null)
                                setEditText('')
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-white/20 text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                              لغو
                            </button>
                          </div>
                        </div>
                      ) : isVoice ? (
                        <div className="space-y-1.5">
                          <audio
                            controls
                            preload="none"
                            src={m.audio_url}
                            className="w-full max-w-[240px] h-9"
                          />
                          <p className={`text-[11px] ${mine ? 'text-violet-100' : 'text-slate-600'}`}>
                            {m.message || 'پیام صوتی'}
                          </p>
                        </div>
                      ) : (
                        <p className="leading-6 whitespace-pre-wrap">{m.message}</p>
                      )}

                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <p className={`text-[10px] ${mine ? 'text-violet-200' : 'text-slate-500'}`}>
                          {formatDate(m.created_at)}
                          {m.is_edited ? ' • ویرایش‌شده' : ''}
                        </p>
                        {mine && !isEditing && (
                          <div className="flex items-center gap-1">
                            {m.message_type !== 'voice' && (
                              <button
                                type="button"
                                title="ویرایش"
                                disabled={sending || recording}
                                onClick={() => {
                                  setEditingId(m.id)
                                  setEditText(m.message || '')
                                }}
                                className={`p-1 rounded-md ${mine ? 'hover:bg-white/15 text-white' : 'hover:bg-slate-50 text-indigo-700'}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="حذف"
                              disabled={sending || recording}
                              onClick={() => removeMessage(m.id)}
                              className={`p-1 rounded-md ${mine ? 'hover:bg-white/15 text-rose-100' : 'hover:bg-rose-50 text-rose-600'}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>

        {showJump && (
          <button type="button" onClick={jumpToLatest} className="chat-jump-btn">
            <ArrowDown className="w-4 h-4" />
            {unreadCount > 0 ? `${unreadCount} پیام جدید` : 'رفتن به آخرین پیام'}
          </button>
        )}

        <form onSubmit={send} className="chat-compose">
          <button
            type="submit"
            disabled={sending || recording || !text.trim()}
            className="chat-send-btn"
            title="ارسال"
          >
            <Send className="w-3.5 h-3.5" />
            <span>ارسال</span>
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="field-input !py-2 flex-1 min-w-0"
            placeholder="پیام خود را بنویسید..."
            disabled={recording || sending}
          />
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              disabled={sending}
              className="chat-side-btn is-mic"
              title="ضبط صوت کم‌حجم (حداکثر ۲۰ ثانیه)"
            >
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
