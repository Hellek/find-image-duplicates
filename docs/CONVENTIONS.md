# Конвенции проекта

Общие правила разработки (IDE-агностичные).

## Язык

- Комментарии и UI-тексты — русский
- Имена переменных, функций, типов — английский

## React и эффекты

- При `setState` в `useEffect` использовать `queueMicrotask()` или `setTimeout(..., 0)` для асинхронного вызова (избегаем `react-hooks/set-state-in-effect`)
- Client Components: директива `'use client'` в начале файла

## Гидрация (SSR / static export)

- **Запрещено** читать browser API (`localStorage`, `sessionStorage`, `window.*`) в инициализаторах `useState(() => ...)` или в теле рендер-функции — это создаёт расхождение между серверным HTML и клиентом (`Hydration mismatch`)
- **Запрещено** использовать ветвления `if (typeof window !== 'undefined')` для выбора начального значения `useState` — результат тот же
- Начальные значения `useState` должны совпадать с тем, что рендерит сервер (т.е. быть детерминированными без browser API)
- Для чтения из хранилища **без моргания** использовать `useLayoutEffect` — он выполняется после коммита DOM, но до отрисовки браузером; `setState` внутри `useLayoutEffect` допустим с `// eslint-disable-next-line react-hooks/set-state-in-effect -- pre-paint` (конвенция про `queueMicrotask` относится к `useEffect`, в `useLayoutEffect` `queueMicrotask` использовать **нельзя** — браузер успеет отрисовать кадр до обработки микрозадачи)
- Для чтения из хранилища, **когда моргание допустимо**, использовать `useEffect` + `queueMicrotask`

## TypeScript

- Избегать `as` (type assertion) в продакшен-коде — использовать type guards, generics, `satisfies` или уточнение типов
- В тестах `as` допустим для мокирования browser API, у которых нет публичных конструкторов (FileList, FileSystemDirectoryHandle и т.п.)

## Сборка

- Проект с `output: 'export'` — статический сайт, без API routes
- Для продакшена — `npm run build` → папка `out/`
