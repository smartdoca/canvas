/** Start clipboard.write in the click gesture, before awaiting host authorization. */
export async function copyImageToClipboard(load: () => Promise<Blob>, signal: AbortSignal) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('IMAGE_CLIPBOARD_UNAVAILABLE')
  let loadError: unknown
  const png = (async () => {
    const blob = await load()
    signal.throwIfAborted()
    if (blob.type === 'image/png') return blob
    const url = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      signal.throwIfAborted()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context || !canvas.width || !canvas.height) throw new Error('IMAGE_COPY_FAILED')
      context.drawImage(image, 0, 0)
      const result = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      signal.throwIfAborted()
      if (!result) throw new Error('IMAGE_COPY_FAILED')
      return result
    } finally { URL.revokeObjectURL(url) }
  })().catch(error => { loadError = error; throw error })
  // Handle the producer even when the browser rejects the clipboard request early.
  void png.catch(() => {})
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]) }
  catch (error) { throw loadError || error }
}
