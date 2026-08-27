export type OutputFormat = 'original' | 'png' | 'jpeg' | 'webp' | 'avif' | 'gif' | 'bmp' | 'tiff'
export type ResizeMode = 'contain' | 'cover' | 'exact'

export interface ProcessingOptions {
  format: OutputFormat
  quality: number
  resize: { enabled: boolean; width: number; height: number; mode: ResizeMode; preventUpscale: boolean }
  crop: { enabled: boolean; x: number; y: number; width: number; height: number }
  rotate: number
  flipHorizontal: boolean
  flipVertical: boolean
  grayscale: boolean
  autoLevel: boolean
  normalize: boolean
  blur: number
  sharpen: number
  optimize: boolean
  stripMetadata: boolean
}

export interface ImageInfo { width: number; height: number; format: string; mimeType: string }
export interface ProcessedImage extends ImageInfo { buffer: ArrayBuffer; extension: string }
export type QueueStatus = 'reading' | 'ready' | 'processing' | 'done' | 'error'

export interface QueueItem {
  id: string
  file: File
  previewUrl: string
  info?: ImageInfo
  status: QueueStatus
  error?: string
  output?: Blob
  outputUrl?: string
  outputName?: string
  outputInfo?: ImageInfo
}

export const DEFAULT_OPTIONS: ProcessingOptions = {
  format: 'original',
  quality: 82,
  resize: { enabled: false, width: 1920, height: 1080, mode: 'contain', preventUpscale: true },
  crop: { enabled: false, x: 0, y: 0, width: 1000, height: 1000 },
  rotate: 0,
  flipHorizontal: false,
  flipVertical: false,
  grayscale: false,
  autoLevel: false,
  normalize: false,
  blur: 0,
  sharpen: 0,
  optimize: true,
  stripMetadata: true,
}
