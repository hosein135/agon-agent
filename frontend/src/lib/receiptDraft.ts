/** ذخیره موقت رسید روی دستگاه تا بعد از رفرش از بین نرود */

const DB_NAME = 'block7_receipt_drafts'
const STORE = 'drafts'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveReceiptDraft({
  unit_name,
  bill_id,
  file,
  note,
}: {
  unit_name?: string
  bill_id?: number | string
  file?: File | null
  note?: string
}) {
  if (!file || bill_id == null) return
  const key = `${unit_name || 'u'}::${bill_id}`
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  await idbReq(
    store.put({
      key,
      unit_name,
      bill_id: Number(bill_id),
      note: note || '',
      fileName: file.name || 'receipt.jpg',
      fileType: file.type || 'image/jpeg',
      blob: file,
      savedAt: Date.now(),
    }),
  )
  db.close()
}

export async function loadReceiptDraft(unit_name: string | undefined, bill_id: number | string) {
  const key = `${unit_name || 'u'}::${bill_id}`
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const row = await idbReq(tx.objectStore(STORE).get(key))
  db.close()
  if (!row?.blob) return null
  const file = new File([row.blob], row.fileName || 'receipt.jpg', {
    type: row.fileType || row.blob.type || 'image/jpeg',
  })
  return { file, note: row.note || '', bill_id: row.bill_id }
}

export async function loadAllDraftsForUnit(unit_name: string | undefined) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const all = await idbReq(tx.objectStore(STORE).getAll())
  db.close()
  const prefix = `${unit_name || 'u'}::`
  return (all || [])
    .filter((r) => String(r.key || '').startsWith(prefix) && r.blob)
    .map((r) => ({
      bill_id: Number(r.bill_id),
      note: r.note || '',
      file: new File([r.blob], r.fileName || 'receipt.jpg', {
        type: r.fileType || r.blob.type || 'image/jpeg',
      }),
    }))
}

export async function clearReceiptDraft(unit_name: string | undefined, bill_id: number | string) {
  const key = `${unit_name || 'u'}::${bill_id}`
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).delete(key))
    db.close()
  } catch {
    /* ignore */
  }
}
