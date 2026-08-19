import { prepareReceiptFile } from './receiptFile'

function b64ToBlob(base64: string, contentType?: string) {
  const bin = atob(base64)
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: contentType || 'image/jpeg' })
}

type ApiJson = {
  error?: string
  path?: string
  token?: string
  supabaseUrl?: string
  publicUrl?: string
  url?: string
}

async function parseJsonResponse(res: Response): Promise<ApiJson> {
  const text = await res.text()
  let data: ApiJson = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    const snippet = (text || '').slice(0, 140)
    throw new Error(
      res.ok
        ? 'پاسخ نامعتبر از سرور'
        : `خطای سرور (${res.status})${snippet ? ': ' + snippet : ' — احتمالاً حجم درخواست زیاد است'}`,
    )
  }
  return data
}

/**
 * آپلود رسید:
 * 1) فشرده‌سازی
 * 2) لینک امضاشده + PUT مستقیم به Supabase Storage (بدون عبور از سقف body سرور)
 * 3) fallback: base64 کوچک به API
 */
export async function uploadReceiptToStorage({
  file,
  unit_name,
  bill_id,
  kind = 'receipt',
  block_number,
  block_direction,
  created_by,
  onProgress,
}: {
  file?: File | Blob | null
  unit_name?: string
  bill_id?: number | string
  kind?: string
  block_number?: string
  block_direction?: string
  created_by?: string
  onProgress?: (msg: string) => void
}) {
  onProgress?.('در حال فشرده‌سازی تصویر...')
  const prepared = await prepareReceiptFile(
    file,
    file instanceof File ? file.name : 'receipt.jpg',
  )
  if (!prepared?.base64) throw new Error('آماده‌سازی تصویر ناموفق بود')

  // --- مسیر 1: signed upload مستقیم ---
  try {
    onProgress?.('در حال دریافت لینک آپلود...')
    const signRes = await fetch('/api/receipt-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sign',
        unit_name,
        bill_id,
        kind,
        block_number,
        block_direction,
        created_by,
        fileName: prepared.fileName,
        contentType: prepared.contentType || 'image/jpeg',
      }),
    })
    const signData = await parseJsonResponse(signRes)
    if (!signRes.ok) throw new Error(signData.error || 'ساخت لینک آپلود ناموفق')

    const path = signData.path
    const token = signData.token
    if (!path || !token) throw new Error('لینک آپلود ناقص است')

    const blob = b64ToBlob(prepared.base64, prepared.contentType || 'image/jpeg')

    const supabaseUrl =
      signData.supabaseUrl ||
      (typeof import.meta !== 'undefined' &&
        (import.meta.env?.VITE_SUPABASE_URL || import.meta.env?.NEXT_PUBLIC_SUPABASE_URL)) ||
      ''

    onProgress?.('در حال آپلود مستقیم فایل...')
    const uploadPath = `${supabaseUrl}/storage/v1/object/upload/sign/receipt-files/${path}?token=${encodeURIComponent(token)}`

    const putRes = await fetch(uploadPath, {
      method: 'PUT',
      headers: {
        'Content-Type': prepared.contentType || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: blob,
    })

    if (putRes.ok) {
      const publicUrl =
        signData.publicUrl ||
        `${supabaseUrl}/storage/v1/object/public/receipt-files/${path}`
      if (!publicUrl) throw new Error('آدرس عمومی فایل ساخته نشد')
      return { url: publicUrl, path, prepared, method: 'signed' }
    }

    const t = await putRes.text().catch(() => '')
    console.warn('signed PUT failed', putRes.status, t.slice(0, 200))
  } catch (e) {
    console.warn('signed upload path failed, fallback', e)
  }

  // --- مسیر 2: base64 کوچک به API ---
  if (prepared.base64.length > 2_400_000) {
    throw new Error(
      'حجم تصویر زیاد است و آپلود مستقیم هم ناموفق بود. اسکرین‌شات کوچک‌تر بگیرید.',
    )
  }

  onProgress?.('در حال آپلود از مسیر جایگزین...')
  const upRes = await fetch('/api/receipt-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: prepared.base64,
      fileName: prepared.fileName,
      contentType: prepared.contentType || 'image/jpeg',
      unit_name,
      bill_id,
      kind,
      block_number,
      block_direction,
      created_by,
    }),
  })
  const upData = await parseJsonResponse(upRes)
  if (!upRes.ok || !upData.url) {
    throw new Error(upData.error || `آپلود ناموفق (${upRes.status})`)
  }
  return { url: upData.url, path: upData.path, prepared, method: 'api' }
}
