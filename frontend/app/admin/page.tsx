'use client'

import { RequireAuth } from '../guards'
import AdminPanel from '@/views/AdminPanel'

export default function AdminPage() {
  return (
    <RequireAuth role="system_admin">
      <AdminPanel />
    </RequireAuth>
  )
}
