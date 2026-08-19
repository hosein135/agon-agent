import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PwaBoot } from './pwa-boot'

export const metadata: Metadata = {
  title: 'بلوک هفت شرقی',
  description: 'سامانه ساکنین و مدیران بلوک هفت شرقی',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'بلوک هفت شرقی',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#4f46e5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <PwaBoot />
        {children}
      </body>
    </html>
  )
}
