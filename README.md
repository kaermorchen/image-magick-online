# Image Magic Online

Клиентское React-приложение для пакетной обработки изображений через официальный `@imagemagick/magick-wasm`. Файлы обрабатываются локально в Web Worker и не отправляются на сервер.

## Возможности

- добавление нескольких локальных файлов, drag-and-drop и загрузка по URL;
- единые batch-настройки для очереди;
- resize (contain/cover/exact), crop, rotate и flip;
- grayscale, auto level, normalize, blur и sharpen;
- PNG, JPEG, WebP, AVIF, GIF, BMP и TIFF;
- настройка качества, оптимизация и удаление метаданных;
- скачивание одного файла или всех результатов в ZIP.

Загрузка по URL работает, если сайт-источник разрешает CORS. В противном случае файл нужно сначала скачать на устройство.

## Запуск

```bash
npm install
npm run dev
```

Проверки: `npm run test`, `npm run lint`, `npm run build`, `npm run e2e`.
Перед первым e2e-прогоном установите браузер: `npx playwright install chromium`.
