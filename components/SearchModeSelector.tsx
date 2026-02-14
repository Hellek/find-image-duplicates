'use client'

import { Eye, Hash } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type SearchMode = 'exact' | 'similar'

interface SearchModeSelectorProps {
  value: SearchMode
  onChange: (mode: SearchMode) => void
}

export function SearchModeSelector({ value, onChange }: SearchModeSelectorProps) {
  return (
    <Tabs value={value} onValueChange={v => onChange(v as SearchMode)} className="w-full max-w-lg">
      <TabsList className="w-full">
        <TabsTrigger value="exact" className="flex-1 gap-2">
          <Hash className="size-4" />
          Точные копии
        </TabsTrigger>
        <TabsTrigger value="similar" className="flex-1 gap-2">
          <Eye className="size-4" />
          Похожие
        </TabsTrigger>
      </TabsList>

      <TabsContent value="exact" className="mt-3">
        <p className="text-sm text-muted-foreground text-center">
          Поиск побайтовых копий через SHA-256.
          Быстрый режим, находит только полностью идентичные файлы.
        </p>
      </TabsContent>

      <TabsContent value="similar" className="mt-3">
        <p className="text-sm text-muted-foreground text-center">
          Поиск визуально похожих изображений через перцептивное хэширование.
          Находит масштабированные, пережатые и слегка изменённые копии.
        </p>
      </TabsContent>
    </Tabs>
  )
}
