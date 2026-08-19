'use client'

import { RequireAuth } from '../guards'
import BlockAdminPanel from '@/views/BlockAdminPanel'

export default function BlockAdminPage() {
  return (
    <RequireAuth role="block_manager">
      <BlockAdminPanel />
    </RequireAuth>
  )
}
