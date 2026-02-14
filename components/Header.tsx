'use client'

import { Images } from 'lucide-react'

export function Header() {
  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex items-center gap-3 px-4 py-4">
        <Images className="size-6 text-primary" />
        <div>
          <h1 className="text-lg font-semibold leading-tight">
            Поиск дубликатов изображений
          </h1>
          <p className="text-sm text-muted-foreground">
            Найдите точные копии и визуально похожие фотографии
          </p>
        </div>
      </div>
    </header>
  )
}
