'use client'

import { RequireAuth } from '../guards'
import UserPanel from '@/views/UserPanel'

export default function PanelPage() {
  return (
    <RequireAuth role="resident">
      <UserPanel />
    </RequireAuth>
  )
}
