'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/session'

type Role = 'resident' | 'system_admin' | 'block_manager' | 'complex_manager' | 'board_member'

export function RequireAuth({
  role,
  children,
}: {
  role: Role
  children: React.ReactNode
}) {
  const router = useRouter()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (role === 'resident') {
      if (!session || session.type !== 'resident') {
        router.replace('/')
        return
      }
      setOk(true)
      return
    }
    if (!session || session.type !== 'admin' || session.admin?.role !== role) {
      router.replace('/')
      return
    }
    setOk(true)
  }, [role, router])

  if (!ok) return null
  return children
}
