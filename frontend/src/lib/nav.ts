'use client'

import { useRouter } from 'next/navigation'

type NavigateOptions = {
  replace?: boolean
}

/** Drop-in for react-router-dom's useNavigate. */
export function useNavigate() {
  const router = useRouter()
  return (to: string, options?: NavigateOptions) => {
    if (typeof to !== 'string' || !to) return
    if (options && options.replace) router.replace(to)
    else router.push(to)
  }
}
