import type { CanvasEditorResources, CanvasResourceUploadContext } from '../sdk/types'

const urls = new Map<string, string>()
function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('aidcanvas-demo-assets', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('images')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function read(path: string) {
  const db = await database()
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const request = db.transaction('images').objectStore('images').get(path)
      request.onsuccess = () => request.result instanceof Blob ? resolve(request.result) : reject(new Error('IMAGE_NOT_FOUND'))
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

async function upload(file: Blob, context: CanvasResourceUploadContext) {
    context.signal?.throwIfAborted()
    const path = `resource:${crypto.randomUUID()}`
    const db = await database()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('images', 'readwrite')
        transaction.objectStore('images').put(file, path)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
    } finally { db.close() }
    return { path, name: context.fileName, mimeType: file.type, size: file.size }
}

export const demoResources: CanvasEditorResources = {
  uploadImage: upload,
  uploadAttachment: upload,
  resolveDownloadUrl: path => demoResources.resolveUrl(path, {}),
  async resolveUrl(path) {
    if (!urls.has(path)) urls.set(path, URL.createObjectURL(await read(path)))
    return urls.get(path)!
  },
  readImage: path => read(path),
}
