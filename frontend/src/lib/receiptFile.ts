/** فشرده‌سازی قوی تصویر رسید برای ارسال مطمئن از share و گالری */

// بعد از base64 باید زیر سقف ~4MB بدنه Vercel بماند
const MAX_DATA_URL_CHARS = 1_200_000 // ~0.9MB binary
const MAX_EDGE_START = 1280

export function dataUrlToBase64(dataUrl: unknown) {
  const s = String(dataUrl || '')
  const i = s.indexOf(',')
  return i >= 0 ? s.slice(i + 1) : s
}

function readAsDataUrl(fileOrBlob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(new Error('خواندن فایل ناموفق بود'))
    r.readAsDataURL(fileOrBlob)
  })
}

function loadImageFromSource(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('بارگذاری تصویر ناموفق بود'))
    // data URL / blob URL — no CORS issue for canvas usually
    img.src = src
  })
}

function canvasToJpegDataUrl(img: CanvasImageSource, width: number, height: number, quality: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false })
  if (!ctx) throw new Error('Canvas در دسترس نیست')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * از File یا dataURL فشرده می‌سازد
 * @returns {{ base64: string, contentType: string, fileName: string, approxBytes: number, dataUrl: string }}
 */
export async function prepareReceiptFile(input: Blob | string | null | undefined, preferredName = '') {
  if (!input) throw new Error('فایلی انتخاب نشده است')

  // نرمال‌سازی ورودی به dataURL + نام
  let sourceDataUrl = ''
  let name = preferredName || 'receipt.jpg'
  let inputType = ''

  if (typeof input === 'string' && input.startsWith('data:')) {
    sourceDataUrl = input
    inputType = (input.match(/^data:([^;,]+)/) || [])[1] || ''
  } else if (input instanceof Blob) {
    name = preferredName || (input instanceof File ? input.name : name)
    inputType = input.type || ''
    // HEIC/empty type از share بعضی گوشی‌ها
    sourceDataUrl = await readAsDataUrl(input)
  } else {
    throw new Error('فرمت فایل پشتیبانی نمی‌شود')
  }

  const isPdf =
    inputType === 'application/pdf' ||
    /\.pdf$/i.test(name) ||
    sourceDataUrl.startsWith('data:application/pdf')

  if (isPdf) {
    if (sourceDataUrl.length > MAX_DATA_URL_CHARS) {
      throw new Error('حجم PDF زیاد است (حداکثر حدود ۹۰۰ کیلوبایت)')
    }
    const base64 = dataUrlToBase64(sourceDataUrl)
    return {
      base64,
      contentType: 'application/pdf',
      fileName: name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`,
      approxBytes: Math.round((base64.length * 3) / 4),
      dataUrl: sourceDataUrl,
    }
  }

  // تصویر — حتی اگر type خالی/octet-stream باشد
  let img
  try {
    img = await loadImageFromSource(sourceDataUrl)
  } catch {
    // اگر decode نشد ولی کوچک است، همان raw را بفرست (ممکن است jpeg باشد)
    if (sourceDataUrl.length <= 500_000) {
      const base64 = dataUrlToBase64(sourceDataUrl)
      const ct = inputType && inputType.startsWith('image/') ? inputType : 'image/jpeg'
      return {
        base64,
        contentType: ct,
        fileName: (name.replace(/\.\w+$/, '') || 'receipt') + (ct.includes('png') ? '.png' : '.jpg'),
        approxBytes: Math.round((base64.length * 3) / 4),
        dataUrl: sourceDataUrl,
      }
    }
    throw new Error(
      'تصویر قابل پردازش نیست (احتمالاً HEIC). از اپ پرداخت به‌صورت JPG/PNG اشتراک بگذارید یا اسکرین‌شات بگیرید.',
    )
  }

  let width = img.naturalWidth || img.width || 1
  let height = img.naturalHeight || img.height || 1
  const scale0 = Math.min(1, MAX_EDGE_START / Math.max(width, height, 1))
  width = Math.max(1, Math.round(width * scale0))
  height = Math.max(1, Math.round(height * scale0))

  let quality = 0.72
  let dataUrl = canvasToJpegDataUrl(img, width, height, quality)

  let guard = 0
  while (dataUrl.length > MAX_DATA_URL_CHARS && guard < 10) {
    guard += 1
    if (quality > 0.42) {
      quality = Math.max(0.4, quality - 0.08)
    } else {
      width = Math.max(280, Math.round(width * 0.75))
      height = Math.max(280, Math.round(height * 0.75))
      quality = 0.55
    }
    dataUrl = canvasToJpegDataUrl(img, width, height, quality)
  }

  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('تصویر هنوز بزرگ است. اسکرین‌شات کوچک‌تر بگیرید و دوباره ارسال کنید')
  }

  const base64 = dataUrlToBase64(dataUrl)
  if (!base64 || base64.length < 32) {
    throw new Error('خروجی فشرده‌سازی نامعتبر بود')
  }

  return {
    base64,
    contentType: 'image/jpeg',
    fileName: (String(name).replace(/\.\w+$/, '') || 'receipt') + '.jpg',
    approxBytes: Math.round((base64.length * 3) / 4),
    dataUrl,
  }
}
