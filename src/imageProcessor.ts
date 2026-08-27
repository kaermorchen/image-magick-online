import type { ImageInfo, ProcessingOptions, ProcessedImage } from './types'

type PendingRequest = {
  resolve: (value: ImageInfo | ProcessedImage) => void
  reject: (reason: Error) => void
}
type WorkerResponse = { id: number; ok: true; result: ImageInfo | ProcessedImage } | { id: number; ok: false; error: string }

let worker: Worker | undefined
let nextId = 1
const pending = new Map<number, PendingRequest>()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./imagemagick.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data
    const request = pending.get(response.id)
    if (!request) return
    pending.delete(response.id)
    if (response.ok) request.resolve(response.result)
    else request.reject(new Error(response.error))
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Ошибка запуска ImageMagick Worker')
    pending.forEach((request) => request.reject(error))
    pending.clear()
  }
  return worker
}

function request<T extends ImageInfo | ProcessedImage>(payload: { type: 'inspect' | 'process'; buffer: ArrayBuffer; options?: ProcessingOptions }): Promise<T> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: (value) => resolve(value as T), reject })
    getWorker().postMessage({ id, ...payload }, [payload.buffer])
  })
}

export const inspectImage = (buffer: ArrayBuffer) => request<ImageInfo>({ type: 'inspect', buffer })
export const processImage = (buffer: ArrayBuffer, options: ProcessingOptions) => request<ProcessedImage>({ type: 'process', buffer, options })
