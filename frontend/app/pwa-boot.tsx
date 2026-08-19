'use client'

import { useEffect, useState } from 'react'
import { initPwa } from '@/lib/pwa'
import { initSessionClient } from '@/lib/sessionClient'

export function PwaBoot() {
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    initSessionClient()
    initPwa({
      onCacheUpdate: () => setUpdating(true),
    })
  }, [])

  if (!updating) return null

  return (
    <div className="cache-update-overlay" role="status" aria-live="polite">
      <div className="cache-update-card">
        <span className="cache-update-spinner" />
        <p>در حال به‌روزرسانی برنامه…</p>
      </div>
    </div>
  )
}
