import { CanvasIOError, CANVAS_IO_CAPABILITIES, type CanvasIOOptions, type CanvasIOProgress } from './types'
export const limits = CANVAS_IO_CAPABILITIES.limits
export function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new CanvasIOError('CANCELLED') }
export function progress(options: CanvasIOOptions, phase: CanvasIOProgress['phase'], completed: number, total = 1) { checkAbort(options.signal); options.onProgress?.({ phase, completed, total }); checkAbort(options.signal) }
export function cancellable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAbort(signal)
  return new Promise((resolve, reject) => {
    const abort = () => reject(new CanvasIOError('CANCELLED'))
    signal?.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort))
  })
}
export function imageDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new CanvasIOError('INVALID_IMAGE_DIMENSIONS')
  if (width > limits.maxImageSide || height > limits.maxImageSide || width * height > limits.maxImagePixels) throw new CanvasIOError('IMAGE_DIMENSIONS_EXCEEDED')
}
export async function decodeImage(blob: Blob, signal?: AbortSignal): Promise<HTMLImageElement> {
  checkAbort(signal)
  const url = URL.createObjectURL(blob), image = new Image()
  try {
    return await cancellable(new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image)
      image.onerror = () => reject(new CanvasIOError('IMAGE_DECODE_FAILED'))
      image.src = url
    }), signal)
  } finally { image.onload = image.onerror = null; URL.revokeObjectURL(url); if (signal?.aborted) image.src = '' }
}
export async function dataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
  const bytes = new Uint8Array(await cancellable(blob.arrayBuffer(), signal))
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  checkAbort(signal)
  return `data:${blob.type};base64,${btoa(binary)}`
}
export function safeFilename(filename: string, extension: string) {
  const base = Array.from(filename.replace(/\.[a-z0-9]+$/i, '')).map(c => c.charCodeAt(0) < 32 ? '_' : c).join('').replace(/[/\\:*?"<>|]/g, '_').slice(0, 120).trim() || 'aidcanvas'
  return `${base}.${extension}`
}
