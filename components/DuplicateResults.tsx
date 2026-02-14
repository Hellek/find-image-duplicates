'use client'

import { Copy, FileCheck, Images, RotateCcw } from 'lucide-react'

import { DuplicateGroup } from '@/components/DuplicateGroup'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DuplicateGroup as DuplicateGroupData } from '@/lib/duplicateFinder'

interface DuplicateResultsProps {
  groups: DuplicateGroupData[]
  totalFiles: number
  mode: 'exact' | 'similar'
  onReset: () => void
}

export function DuplicateResults({ groups, totalFiles, mode, onReset }: DuplicateResultsProps) {
  const duplicateFiles = groups.reduce((sum, g) => sum + g.files.length, 0)
  const uniqueFiles = totalFiles - duplicateFiles + groups.length

  return (
    <div className="w-full space-y-6">
      {/* Статистика */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Images className="size-4" />
          Всего:
          {' '}
          {totalFiles}
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <FileCheck className="size-4" />
          Уникальных:
          {' '}
          {uniqueFiles}
        </Badge>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Copy className="size-4" />
          Групп дубликатов:
          {' '}
          {groups.length}
        </Badge>
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
          Режим:
          {' '}
          {mode === 'exact' ? 'Точные копии' : 'Похожие'}
        </Badge>
      </div>

      {/* Результаты */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <FileCheck className="size-12 text-muted-foreground" />
          <div>
            <p className="text-lg font-medium">Дубликатов не найдено</p>
            <p className="text-sm text-muted-foreground">
              Все
              {' '}
              {totalFiles}
              {' '}
              изображений уникальны
              {mode === 'similar' && '. Попробуйте увеличить порог схожести'}
              .
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, idx) => (
            <DuplicateGroup key={group.hash} group={group} index={idx} />
          ))}
        </div>
      )}

      {/* Кнопка нового поиска */}
      <div className="flex justify-center pt-4">
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="size-4" />
          Новый поиск
        </Button>
      </div>
    </div>
  )
}
