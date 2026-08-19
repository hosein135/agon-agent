'use client'

import { RequireAuth } from '../guards'
import ComplexAdminPanel from '@/views/ComplexAdminPanel'

export default function ComplexAdminPage() {
  return (
    <RequireAuth role="complex_manager">
      <ComplexAdminPanel />
    </RequireAuth>
  )
}
