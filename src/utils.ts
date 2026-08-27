import type { OutputFormat } from './types'

const outputExtensions: Record<Exclude<OutputFormat, 'original'>, string> = {
  png: 'png', jpeg: 'jpg', webp: 'webp', avif: 'avif', gif: 'gif', bmp: 'bmp', tiff: 'tiff',
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`
}

export function outputFileName(name: string, format: OutputFormat, detectedExtension?: string): string {
  const base = name.replace(/\.[^/.]+$/, '') || 'image'
  const originalExtension = name.match(/\.([^/.]+)$/)?.[1]?.toLowerCase()
  const extension = format === 'original' ? (detectedExtension || originalExtension || 'png') : outputExtensions[format]
  return `${base}-processed.${extension}`
}

export function uniqueFileName(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  let index = 2
  let candidate = `${base}-${index}${extension}`
  while (used.has(candidate)) { index += 1; candidate = `${base}-${index}${extension}` }
  used.add(candidate)
  return candidate
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}
