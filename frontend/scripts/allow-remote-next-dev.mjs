import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const marker = 'AGON_ALLOW_REMOTE_DEV'
const insert = `    return false; // ${marker}\n`
const files = [
  'node_modules/next/dist/server/lib/router-utils/block-cross-site.js',
  'node_modules/next/dist/esm/server/lib/router-utils/block-cross-site.js',
]

for (const rel of files) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) continue
  const src = fs.readFileSync(file, 'utf8')
  if (src.includes(marker)) continue
  const next = src.replace(
    /(export const blockCrossSite = \([^)]*\)\s*=>\s*\{|const blockCrossSite = \([^)]*\)\s*=>\s*\{)/,
    `$1\n${insert}`,
  )
  if (next === src) {
    console.warn(`[agon] could not patch ${rel}`)
    continue
  }
  fs.writeFileSync(file, next)
  console.log(`[agon] patched ${rel}`)
}
