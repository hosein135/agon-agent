export default function TabBadge({
  count,
  title,
}: {
  count?: number | string | null
  title?: string
}) {
  const n = Math.max(0, Number(count) || 0)
  if (n <= 0) return null
  const label = n > 99 ? '99+' : String(n)
  return (
    <span
      className="tab-badge"
      title={title || `${n} مورد جدید`}
      aria-label={title || `${n} مورد جدید`}
    >
      {label}
    </span>
  )
}
