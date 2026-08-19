import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * This app has no Server Actions (`use server`). Public Next.js instances
 * get scanned with fake Next-Action IDs ("x", "exploit", …). Reject those
 * before Next.js logs "failed-to-find-server-action".
 */
export function middleware(request: NextRequest) {
  if (request.headers.get('next-action')) {
    return new NextResponse(null, { status: 404 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|fonts/).*)'],
}
