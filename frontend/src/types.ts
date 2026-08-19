import type { LucideIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

export type AdminRole = string

export type Occupancy = 'مالک' | 'مستاجر' | string

export type PanelUser = {
  id?: number
  unit_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  floor?: string
  occupancy?: Occupancy
  people_count?: number | string
  block_number?: string
  block_direction?: string
  pin?: string
  full_name?: string
  status?: string
  is_occupant?: boolean
  created_at?: string
  [key: string]: any
}

export type Resident = PanelUser

export type AdminUser = {
  id?: number
  role?: string
  username?: string
  full_name?: string
  first_name?: string
  last_name?: string
  phone?: string
  block_number?: string
  block_direction?: string
  complex_name?: string
  title?: string
  permissions?: Record<string, boolean>
  created_at?: string
  [key: string]: any
}

export type ResidentSession = {
  type: 'resident'
  token?: string
  user: Resident
  admin?: never
}

export type AdminSession = {
  type: 'admin'
  token?: string
  admin: AdminUser
  user?: never
}

export type Session = {
  type: 'resident' | 'admin'
  token?: string
  expires_at?: string
  user?: Resident
  admin?: AdminUser
}

export type DesignTheme = {
  tabs: string
  backlight: string
  background: string
}

export type DesignColor = {
  id: string
  hex: string
  label: string
}

export type Bill = {
  id?: number
  unit_name?: string
  title?: string
  amount?: number | string
  status?: string
  created_at?: string
  due_date?: string
  paid_at?: string
  receive_date?: string
  description?: string
  first_name?: string
  last_name?: string
  floor?: string
  receipt_url?: string
  [key: string]: unknown
}

export type FinanceRow = {
  debt_amount?: number | string
  [key: string]: unknown
}

export type ChatMessage = {
  id: number
  message?: string
  message_type?: string
  audio_url?: string
  unit_name?: string
  sender_name?: string
  sender_type?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export type SharePayload = {
  title?: string
  text?: string
  url?: string
  fileDataUrl?: string
  fileName?: string
  fileType?: string
  receivedAt?: string
  source?: string
  tooLarge?: boolean
  savedAt?: number
  [key: string]: unknown
}

export type MenuSubItem = {
  id: string
  label: string
  desc?: string
  icon?: LucideIcon
}

export type MenuSection = {
  id: string
  label: string
  icon: LucideIcon
  subs?: MenuSubItem[]
}

export type HelpItemData = {
  title: string
  body: string
}

export type PasswordApi = {
  url: string
  bodyFromForm: (form: {
    current_password: string
    new_password: string
    confirm_password: string
  }) => Record<string, unknown>
  onSuccess?: (data: any) => void
}

export type CssVars = CSSProperties & Record<`--${string}`, string>

export type JsonMap = Record<string, unknown>

export type CountMap = Record<string, number>

export type ChildrenProps = {
  children?: ReactNode
}

export type ChangedHandler = () => void | Promise<void>
