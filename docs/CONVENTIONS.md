# Конвенции проекта

Общие правила разработки (IDE-агностичные).

## Язык

- Комментарии и UI-тексты — русский
- Имена переменных, функций, типов — английский

## React и эффекты

- При `setState` в `useEffect` использовать `queueMicrotask()` или `setTimeout(..., 0)` для асинхронного вызова (избегаем `react-hooks/set-state-in-effect`)
- Client Components: директива `'use client'` в начале файла

## Сборка

- Проект с `output: 'export'` — статический сайт, без API routes
- Для продакшена — `npm run build` → папка `out/`
