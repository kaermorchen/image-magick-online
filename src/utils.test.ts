import { describe, expect, it } from 'vitest'
import { formatBytes, outputFileName, uniqueFileName } from './utils'

describe('formatBytes', () => {
  it('formats bytes using Russian units', () => {
    expect(formatBytes(0)).toBe('0 Б')
    expect(formatBytes(1536)).toBe('1.5 КБ')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 МБ')
  })
})
describe('outputFileName', () => {
  it('changes the extension for conversion', () => expect(outputFileName('holiday.photo.PNG', 'webp')).toBe('holiday.photo-processed.webp'))
  it('uses the detected extension', () => expect(outputFileName('scan', 'original', 'tiff')).toBe('scan-processed.tiff'))
})
describe('uniqueFileName', () => {
  it('adds a numeric suffix for zip collisions', () => {
    const used = new Set<string>()
    expect(uniqueFileName('image.jpg', used)).toBe('image.jpg')
    expect(uniqueFileName('image.jpg', used)).toBe('image-2.jpg')
    expect(uniqueFileName('image.jpg', used)).toBe('image-3.jpg')
  })
})
