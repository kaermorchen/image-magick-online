import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { inspectImage, processImage } from './imageProcessor'
import { DEFAULT_OPTIONS, type ProcessingOptions, type QueueItem } from './types'
import { formatBytes, getErrorMessage, outputFileName, uniqueFileName } from './utils'
import './App.css'

const acceptedExtensions = '.png,.jpg,.jpeg,.webp,.avif,.gif,.bmp,.tif,.tiff,.heic,.heif'
const makeId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function NumberInput({ value, onChange, min = 0, label }: { value: number; onChange: (value: number) => void; min?: number; label: string }) {
  return <label className="field compact-field"><span>{label}</span><input type="number" min={min} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} /></label>
}

function App() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS)
  const [url, setUrl] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const itemsRef = useRef(items)

  useEffect(() => { itemsRef.current = items }, [items])

  useEffect(() => () => itemsRef.current.forEach((item) => {
    URL.revokeObjectURL(item.previewUrl)
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl)
  }), [])

  const busy = items.some((item) => item.status === 'processing' || item.status === 'reading')
  const completed = items.filter((item) => item.status === 'done' && item.output)
  const totalInput = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items])
  const totalOutput = useMemo(() => completed.reduce((sum, item) => sum + (item.output?.size ?? 0), 0), [completed])
  const updateItem = (id: string, update: Partial<QueueItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...update } : item))

  async function addFiles(files: File[]) {
    const newItems = files.map<QueueItem>((file) => ({ id: makeId(), file, previewUrl: URL.createObjectURL(file), status: 'reading' }))
    setItems((current) => [...current, ...newItems])
    await Promise.all(newItems.map(async (item) => {
      try {
        updateItem(item.id, { info: await inspectImage(await item.file.arrayBuffer()), status: 'ready' })
      } catch (error) {
        updateItem(item.id, { status: 'error', error: `Не удалось прочитать: ${getErrorMessage(error)}` })
      }
    }))
  }

  async function addFromUrl() {
    const value = url.trim()
    if (!value) return
    setUrlLoading(true); setUrlError('')
    try {
      const parsed = new URL(value)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Нужна ссылка http:// или https://')
      const response = await fetch(parsed.href)
      if (!response.ok) throw new Error(`Сервер ответил ${response.status}`)
      const blob = await response.blob()
      const fallbackName = parsed.pathname.split('/').pop() || 'image'
      const name = fallbackName.includes('.') ? fallbackName : `image.${blob.type.split('/')[1] || 'png'}`
      await addFiles([new File([blob], decodeURIComponent(name), { type: blob.type })])
      setUrl('')
    } catch (error) {
      const reason = getErrorMessage(error)
      setUrlError(reason === 'Failed to fetch' ? 'Сайт-источник запретил загрузку из браузера (CORS). Скачайте файл и добавьте его вручную.' : reason)
    } finally { setUrlLoading(false) }
  }

  function removeItem(id: string) {
    setItems((current) => {
      const target = current.find((item) => item.id === id)
      if (target) { URL.revokeObjectURL(target.previewUrl); if (target.outputUrl) URL.revokeObjectURL(target.outputUrl) }
      return current.filter((item) => item.id !== id)
    })
  }

  function clearAll() {
    items.forEach((item) => { URL.revokeObjectURL(item.previewUrl); if (item.outputUrl) URL.revokeObjectURL(item.outputUrl) })
    setItems([])
  }

  async function runBatch() {
    const candidates = items.filter((item) => item.status !== 'reading' && item.status !== 'processing')
    for (const item of candidates) {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl)
      updateItem(item.id, { status: 'processing', error: undefined, output: undefined, outputUrl: undefined })
      try {
        const result = await processImage(await item.file.arrayBuffer(), options)
        const output = new Blob([result.buffer], { type: result.mimeType })
        updateItem(item.id, {
          status: 'done', output, outputUrl: URL.createObjectURL(output),
          outputName: outputFileName(item.file.name, options.format, result.extension), outputInfo: result,
        })
      } catch (error) { updateItem(item.id, { status: 'error', error: getErrorMessage(error) }) }
    }
  }

  async function downloadAll() {
    if (completed.length === 1) { downloadBlob(completed[0].output!, completed[0].outputName!); return }
    setArchiving(true)
    try {
      const zip = new JSZip(); const used = new Set<string>()
      completed.forEach((item) => zip.file(uniqueFileName(item.outputName!, used), item.output!))
      downloadBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), 'imagemagick-results.zip')
    } finally { setArchiving(false) }
  }

  const setResize = (patch: Partial<ProcessingOptions['resize']>) => setOptions((current) => ({ ...current, resize: { ...current.resize, ...patch } }))
  const setCrop = (patch: Partial<ProcessingOptions['crop']>) => setOptions((current) => ({ ...current, crop: { ...current.crop, ...patch } }))

  return <main className="app-shell">
    <header className="app-header">
      <div><p className="eyebrow">IMAGE MAGIC · ЛОКАЛЬНО В БРАУЗЕРЕ</p><h1>Обработка изображений</h1><p className="lead">Добавьте файлы, настройте одну операцию для всей очереди и скачайте результат. Изображения не покидают ваш браузер.</p></div>
      <span className="wasm-badge"><i /> ImageMagick WASM</span>
    </header>

    <section className="panel upload-panel" aria-labelledby="upload-heading">
      <div className="section-heading"><div><span className="step">1</span><h2 id="upload-heading">Добавьте изображения</h2></div>{items.length > 0 && <span className="summary">{items.length} шт. · {formatBytes(totalInput)}</span>}</div>
      <div className={`dropzone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }} onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }} onDrop={(e) => { e.preventDefault(); setDragActive(false); void addFiles(Array.from(e.dataTransfer.files)) }}>
        <div className="upload-icon" aria-hidden="true">↑</div><strong>Перетащите изображения сюда</strong><span>или выберите несколько файлов</span>
        <button type="button" className="button secondary" onClick={() => fileInput.current?.click()}>Выбрать файлы</button>
        <input ref={fileInput} className="visually-hidden" type="file" accept={`image/*,${acceptedExtensions}`} multiple onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        <small>PNG, JPEG, WebP, AVIF, GIF, TIFF, BMP, HEIC</small>
      </div>
      <div className="divider"><span>или по ссылке</span></div>
      <div className="url-row"><label className="visually-hidden" htmlFor="image-url">URL изображения</label><input id="image-url" type="url" value={url} placeholder="https://example.com/image.jpg" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addFromUrl() }} /><button type="button" className="button secondary" disabled={urlLoading || !url.trim()} onClick={() => void addFromUrl()}>{urlLoading ? 'Загрузка…' : 'Добавить URL'}</button></div>
      {urlError && <p className="error-message" role="alert">{urlError}</p>}
    </section>

    {items.length > 0 && <section className="workspace">
      <section className="panel settings-panel" aria-labelledby="settings-heading">
        <div className="section-heading"><div><span className="step">2</span><h2 id="settings-heading">Настройки</h2></div><button className="text-button" type="button" onClick={() => setOptions(DEFAULT_OPTIONS)}>Сбросить</button></div>
        <div className="settings-grid">
          <fieldset><legend>Формат и оптимизация</legend>
            <label className="field"><span>Формат результата</span><select value={options.format} onChange={(e) => setOptions({ ...options, format: e.target.value as ProcessingOptions['format'] })}><option value="original">Как в оригинале</option><option value="jpeg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option><option value="avif">AVIF</option><option value="gif">GIF</option><option value="tiff">TIFF</option><option value="bmp">BMP</option></select></label>
            <label className="field range-field"><span>Качество <b>{options.quality}%</b></span><input type="range" min="1" max="100" value={options.quality} onChange={(e) => setOptions({ ...options, quality: Number(e.target.value) })} /></label>
            <label className="check"><input type="checkbox" checked={options.optimize} onChange={(e) => setOptions({ ...options, optimize: e.target.checked })} /> Оптимизировать размер файла</label>
            <label className="check"><input type="checkbox" checked={options.stripMetadata} onChange={(e) => setOptions({ ...options, stripMetadata: e.target.checked })} /> Удалить EXIF и метаданные</label>
          </fieldset>
          <fieldset><legend><label className="check"><input type="checkbox" checked={options.resize.enabled} onChange={(e) => setResize({ enabled: e.target.checked })} /> Изменить размер</label></legend>
            <div className="two-columns"><NumberInput label="Ширина" value={options.resize.width} onChange={(width) => setResize({ width })} /><NumberInput label="Высота" value={options.resize.height} onChange={(height) => setResize({ height })} /></div>
            <label className="field"><span>Режим</span><select disabled={!options.resize.enabled} value={options.resize.mode} onChange={(e) => setResize({ mode: e.target.value as ProcessingOptions['resize']['mode'] })}><option value="contain">Вписать целиком</option><option value="cover">Заполнить и обрезать</option><option value="exact">Точный размер</option></select></label>
            <label className="check"><input type="checkbox" disabled={!options.resize.enabled} checked={options.resize.preventUpscale} onChange={(e) => setResize({ preventUpscale: e.target.checked })} /> Не увеличивать маленькие</label>
          </fieldset>
          <fieldset><legend><label className="check"><input type="checkbox" checked={options.crop.enabled} onChange={(e) => setCrop({ enabled: e.target.checked })} /> Обрезать область</label></legend>
            <div className="four-columns"><NumberInput label="X" value={options.crop.x} onChange={(x) => setCrop({ x })} /><NumberInput label="Y" value={options.crop.y} onChange={(y) => setCrop({ y })} /><NumberInput label="Шир." value={options.crop.width} onChange={(width) => setCrop({ width })} /><NumberInput label="Выс." value={options.crop.height} onChange={(height) => setCrop({ height })} /></div>
            <label className="field"><span>Поворот</span><select value={options.rotate} onChange={(e) => setOptions({ ...options, rotate: Number(e.target.value) })}><option value="0">Без поворота</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>
            <div className="inline-checks"><label className="check"><input type="checkbox" checked={options.flipHorizontal} onChange={(e) => setOptions({ ...options, flipHorizontal: e.target.checked })} /> Отразить ↔</label><label className="check"><input type="checkbox" checked={options.flipVertical} onChange={(e) => setOptions({ ...options, flipVertical: e.target.checked })} /> Отразить ↕</label></div>
          </fieldset>
          <fieldset><legend>Коррекция</legend>
            <div className="inline-checks wrap"><label className="check"><input type="checkbox" checked={options.grayscale} onChange={(e) => setOptions({ ...options, grayscale: e.target.checked })} /> Чёрно-белое</label><label className="check"><input type="checkbox" checked={options.autoLevel} onChange={(e) => setOptions({ ...options, autoLevel: e.target.checked })} /> Автоуровни</label><label className="check"><input type="checkbox" checked={options.normalize} onChange={(e) => setOptions({ ...options, normalize: e.target.checked })} /> Нормализация</label></div>
            <label className="field range-field"><span>Размытие <b>{options.blur}</b></span><input type="range" min="0" max="10" step="0.5" value={options.blur} onChange={(e) => setOptions({ ...options, blur: Number(e.target.value) })} /></label>
            <label className="field range-field"><span>Резкость <b>{options.sharpen}</b></span><input type="range" min="0" max="10" step="0.5" value={options.sharpen} onChange={(e) => setOptions({ ...options, sharpen: Number(e.target.value) })} /></label>
          </fieldset>
        </div>
      </section>

      <section className="panel queue-panel" aria-labelledby="queue-heading">
        <div className="section-heading"><div><span className="step">3</span><h2 id="queue-heading">Очередь</h2></div><button className="text-button danger" type="button" disabled={busy} onClick={clearAll}>Очистить</button></div>
        <div className="queue-list">{items.map((item) => <article className="queue-item" key={item.id}>
          <img src={item.outputUrl || item.previewUrl} alt="" /><div className="file-info"><strong title={item.file.name}>{item.file.name}</strong><span>{item.info ? `${item.info.width}×${item.info.height} · ${item.info.format} · ` : ''}{formatBytes(item.file.size)}{item.output && <> → <b>{item.outputInfo ? `${item.outputInfo.width}×${item.outputInfo.height} · ${item.outputInfo.format} · ` : ''}{formatBytes(item.output.size)}</b></>}</span>{item.error && <small className="item-error">{item.error}</small>}</div>
          <span className={`status ${item.status}`}>{item.status === 'reading' && 'Чтение…'}{item.status === 'ready' && 'Готов'}{item.status === 'processing' && 'Обработка…'}{item.status === 'done' && 'Готово'}{item.status === 'error' && 'Ошибка'}</span>
          {item.output ? <button className="icon-button" type="button" title="Скачать" aria-label={`Скачать ${item.outputName}`} onClick={() => downloadBlob(item.output!, item.outputName!)}>↓</button> : <button className="icon-button" type="button" disabled={item.status === 'processing'} title="Удалить" aria-label={`Удалить ${item.file.name}`} onClick={() => removeItem(item.id)}>×</button>}
        </article>)}</div>
        <div className="actions"><div><strong>{completed.length ? `${completed.length} из ${items.length} обработано` : `${items.length} в очереди`}</strong><span>{completed.length ? `${formatBytes(totalInput)} → ${formatBytes(totalOutput)}` : 'Настройки применятся ко всем файлам'}</span></div>
          <button className="button primary" type="button" disabled={busy || items.length === 0} onClick={() => void runBatch()}>{items.some((item) => item.status === 'processing') ? 'Обработка…' : completed.length ? 'Обработать заново' : 'Обработать все'}</button>
          {completed.length > 0 && <button className="button success" type="button" disabled={archiving || busy} onClick={() => void downloadAll()}>{archiving ? 'Архивация…' : completed.length === 1 ? 'Скачать файл' : `Скачать ZIP (${completed.length})`}</button>}
        </div>
      </section>
    </section>}
    <footer>Обработка выполняется локально с помощью ImageMagick WebAssembly.</footer>
  </main>
}

export default App
