'use client'

import { RequireAuth } from '../guards'
import BoardMemberPanel from '@/views/BoardMemberPanel'

export default function BoardAdminPage() {
  return (
    <RequireAuth role="board_member">
      <BoardMemberPanel />
    </RequireAuth>
  )
}
