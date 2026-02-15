# components/

- UI-компоненты, Client Components (`'use client'`)
- Именование: PascalCase
- UI-примитивы в `components/ui/` (Radix-based)
- Максимум 120 символов в строке (@stylistic/max-len)

## Чтение из localStorage / sessionStorage

- **Не** читать в `useState(() => ...)` — ломает гидрацию (см. `docs/CONVENTIONS.md`)
- Для критичного UX (вкладки, тема) → `useLayoutEffect` + прямой `setState` (без моргания)
- Для некритичного UX → `useEffect` + `queueMicrotask(() => setState(...))`
