import { expect, test } from '@playwright/test'

function createBmp(width: number, height: number) {
  const rowSize = Math.ceil(width * 3 / 4) * 4
  const pixelSize = rowSize * height
  const data = Buffer.alloc(54 + pixelSize)
  data.write('BM', 0)
  data.writeUInt32LE(data.length, 2)
  data.writeUInt32LE(54, 10)
  data.writeUInt32LE(40, 14)
  data.writeInt32LE(width, 18)
  data.writeInt32LE(height, 22)
  data.writeUInt16LE(1, 26)
  data.writeUInt16LE(24, 28)
  data.writeUInt32LE(pixelSize, 34)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = 54 + y * rowSize + x * 3
      data[offset] = 220
      data[offset + 1] = 92
      data[offset + 2] = x < width / 2 ? 78 : 245
    }
  }
  return data
}

test('processes an image in the browser with ImageMagick WASM', async ({ page }, testInfo) => {
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Обработка изображений' })).toBeVisible()

  await page.locator('input[type=file]').setInputFiles([
    { name: 'sample.bmp', mimeType: 'image/bmp', buffer: createBmp(120, 80) },
    { name: 'sample.bmp', mimeType: 'image/bmp', buffer: createBmp(120, 80) },
  ])
  await expect(page.getByText(/120×80 · BMP/)).toHaveCount(2, { timeout: 30_000 })

  await page.getByLabel('Изменить размер').check()
  await page.getByLabel('Ширина').fill('40')
  await page.getByLabel('Высота').fill('40')
  await page.getByLabel('Формат результата').selectOption('webp')
  await page.getByRole('button', { name: 'Обработать все' }).click()

  await expect(page.getByText(/40×27 · WEBP/)).toHaveCount(2, { timeout: 30_000 })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать ZIP (2)' }).click()
  expect((await downloadPromise).suggestedFilename()).toBe('imagemagick-results.zip')
  expect(browserErrors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('app.png'), fullPage: true })
})

test('converts to every format offered in the interface', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({
    name: 'formats.bmp', mimeType: 'image/bmp', buffer: createBmp(16, 12),
  })
  await expect(page.getByText(/16×12 · BMP/)).toBeVisible({ timeout: 30_000 })

  for (const [option, expected] of [
    ['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WEBP'], ['avif', 'AVIF'],
    ['gif', 'GIF'], ['tiff', 'TIFF'], ['bmp', 'BMP'],
  ]) {
    await page.getByLabel('Формат результата').selectOption(option)
    await page.getByRole('button', { name: /Обработать (все|заново)/ }).click()
    await expect(page.getByText(new RegExp(`→.*${expected}`))).toBeVisible({ timeout: 30_000 })
  }
})
