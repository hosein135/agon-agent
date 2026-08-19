import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function collectAllowedDevOrigins() {
  const origins = new Set([
    '127.0.0.1',
    // Any IPv4 origin (phone / LAN / public IP hitting next dev).
    // Next.js otherwise 403s /_next/static when the page is not localhost.
    '*.*.*.*',
  ])
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const net of addrs || []) {
      if (!net?.address) continue
      origins.add(net.address.split('%')[0])
    }
  }
  const extra = [process.env.ALLOWED_DEV_ORIGINS, process.env.PUBLIC_HOST, process.env.HOST]
    .filter(Boolean)
    .join(',')
  for (const part of extra.split(/[\s,]+/)) {
    let host = part.trim()
    if (!host) continue
    host = host.replace(/^https?:\/\//, '').split('/')[0]
    if (host.startsWith('[') && host.includes(']')) {
      host = host.slice(1, host.indexOf(']'))
    } else {
      host = host.replace(/:\d+$/, '')
    }
    if (host && host !== '0.0.0.0' && host !== '::' && host !== '[::]') {
      origins.add(host)
    }
  }
  return [...origins]
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: collectAllowedDevOrigins(),
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Stop file tracing from walking up to /mnt/c (pagefile.sys, etc. on WSL).
  outputFileTracingRoot: __dirname,
  httpAgentOptions: {
    keepAlive: true,
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 64,
  },
  webpack: (config, { dev }) => {
    if (!dev) return config
    config.watchOptions = {
      ...config.watchOptions,
      followSymlinks: false,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/pagefile.sys',
        '**/hiberfil.sys',
        '**/swapfile.sys',
        '**/DumpStack.log.tmp',
        '/mnt/c/pagefile.sys',
        '/mnt/c/hiberfil.sys',
        '/mnt/c/swapfile.sys',
        '/mnt/c/DumpStack.log.tmp',
        '/mnt/c/$Recycle.Bin/**',
        '/mnt/c/System Volume Information/**',
      ],
    }
    return config
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://127.0.0.1:4000'
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
    ]
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
