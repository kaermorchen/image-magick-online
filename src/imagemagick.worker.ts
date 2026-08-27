/// <reference lib="webworker" />

import {
  AlphaAction, Gravity, ImageMagick, MagickColors, MagickFormat, MagickGeometry,
  MagickImageInfo, initializeImageMagick, type IMagickImage, type MagickFormat as MagickFormatType,
} from '@imagemagick/magick-wasm'
import magickWasm from '@imagemagick/magick-wasm/magick.wasm?url'
import type { ImageInfo, ProcessingOptions, ProcessedImage } from './types'

type WorkerRequest =
  | { id: number; type: 'inspect'; buffer: ArrayBuffer }
  | { id: number; type: 'process'; buffer: ArrayBuffer; options: ProcessingOptions }
type WorkerResponse =
  | { id: number; ok: true; result: ImageInfo | ProcessedImage }
  | { id: number; ok: false; error: string }

const formatMap = {
  png: MagickFormat.Png, jpeg: MagickFormat.Jpeg, webp: MagickFormat.WebP, avif: MagickFormat.Avif,
  gif: MagickFormat.Gif, bmp: MagickFormat.Bmp, tiff: MagickFormat.Tiff,
} as const
const outputDetails: Record<string, { extension: string; mimeType: string }> = {
  PNG: { extension: 'png', mimeType: 'image/png' },
  JPEG: { extension: 'jpg', mimeType: 'image/jpeg' }, JPG: { extension: 'jpg', mimeType: 'image/jpeg' },
  WEBP: { extension: 'webp', mimeType: 'image/webp' }, AVIF: { extension: 'avif', mimeType: 'image/avif' },
  HEIC: { extension: 'heic', mimeType: 'image/heic' }, HEIF: { extension: 'heif', mimeType: 'image/heif' },
  GIF: { extension: 'gif', mimeType: 'image/gif' }, BMP: { extension: 'bmp', mimeType: 'image/bmp' },
  TIFF: { extension: 'tiff', mimeType: 'image/tiff' }, SVG: { extension: 'svg', mimeType: 'image/svg+xml' },
}

let initialization: Promise<void> | undefined
const ensureInitialized = () => initialization ??= initializeImageMagick(new URL(magickWasm, import.meta.url))
const detailsFor = (format: string) => outputDetails[format.toUpperCase()] ?? {
  extension: format.toLowerCase() || 'img', mimeType: 'application/octet-stream',
}

function inspect(buffer: ArrayBuffer): ImageInfo {
  const info = MagickImageInfo.create(new Uint8Array(buffer))
  return { width: info.width, height: info.height, format: info.format, mimeType: detailsFor(info.format).mimeType }
}

function applyResize(image: IMagickImage, options: ProcessingOptions) {
  const { width, height, mode, preventUpscale } = options.resize
  if (!options.resize.enabled || width <= 0 || height <= 0) return
  if (mode === 'exact') {
    const geometry = new MagickGeometry(width, height)
    geometry.ignoreAspectRatio = true
    geometry.greater = preventUpscale
    image.resize(geometry)
    return
  }
  const geometry = new MagickGeometry(width, height)
  geometry.greater = preventUpscale
  geometry.fillArea = mode === 'cover'
  image.resize(geometry)
  if (mode === 'cover') { image.crop(width, height, Gravity.Center); image.resetPage() }
}

function applyOperations(image: IMagickImage, options: ProcessingOptions) {
  image.autoOrient()
  applyResize(image, options)
  if (options.crop.enabled && options.crop.width > 0 && options.crop.height > 0) {
    const x = Math.max(0, options.crop.x)
    const y = Math.max(0, options.crop.y)
    const width = Math.min(options.crop.width, image.width - x)
    const height = Math.min(options.crop.height, image.height - y)
    if (width > 0 && height > 0) {
      image.crop(new MagickGeometry(x, y, width, height))
      image.resetPage()
    }
  }
  if (options.rotate) image.rotate(options.rotate)
  if (options.flipHorizontal) image.flop()
  if (options.flipVertical) image.flip()
  if (options.grayscale) image.grayscale()
  if (options.autoLevel) image.autoLevel()
  if (options.normalize) image.normalize()
  if (options.blur > 0) image.gaussianBlur(0, options.blur)
  if (options.sharpen > 0) image.sharpen(0, options.sharpen)
  if (options.stripMetadata) image.strip()
}

function process(buffer: ArrayBuffer, options: ProcessingOptions): ProcessedImage {
  const sourceInfo = MagickImageInfo.create(new Uint8Array(buffer))
  const format = options.format === 'original' ? sourceInfo.format : formatMap[options.format]
  const details = detailsFor(format)
  return ImageMagick.read(new Uint8Array(buffer), (image) => {
    applyOperations(image, options)
    image.quality = options.quality
    image.format = format as MagickFormatType
    if (format === MagickFormat.Jpeg) {
      image.backgroundColor = MagickColors.White
      image.alpha(AlphaAction.Remove)
      if (options.optimize) image.settings.setDefine(MagickFormat.Jpeg, 'optimize-coding', true)
    }
    if (format === MagickFormat.Png && options.optimize) image.settings.setDefine(MagickFormat.Png, 'compression-level', 9)
    if (format === MagickFormat.WebP && options.optimize) image.settings.setDefine(MagickFormat.WebP, 'method', 6)
    return image.write(format as MagickFormatType, (data) => ({
      buffer: new Uint8Array(data).slice().buffer,
      width: image.width, height: image.height, format, mimeType: details.mimeType, extension: details.extension,
    }))
  })
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    await ensureInitialized()
    const result = request.type === 'inspect' ? inspect(request.buffer) : process(request.buffer, request.options)
    const response: WorkerResponse = { id: request.id, ok: true, result }
    const transfers: Transferable[] = 'buffer' in result ? [result.buffer as ArrayBuffer] : []
    self.postMessage(response, { transfer: transfers })
  } catch (error) {
    const response: WorkerResponse = {
      id: request.id, ok: false,
      error: error instanceof Error ? error.message : 'ImageMagick не смог обработать файл',
    }
    self.postMessage(response)
  }
}
