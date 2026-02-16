'use client'

import { Loader2, X } from 'lucide-react'

import { DirectoryTree } from '@/components/DirectoryTree'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { ScanProgress as ScanProgressData } from '@/lib/duplicateFinder'
import { formatEta, formatSpeed } from '@/lib/duplicateFinder'
import type { DirectoryTreeNode } from '@/lib/fileSystem'

interface ScanProgressProps {
  progress: ScanProgressData
  directoryTree?: DirectoryTreeNode[]
  onCancel: () => void
}

const PHASE_LABELS: Record<ScanProgressData['phase'], string> = {
  discovering: 'Обнаружение структуры...',
  scanning: 'Сканирование файлов...',
  hashing: 'Вычисление хэшей...',
  comparing: 'Сравнение изображений...',
}

export function ScanProgress({ progress, directoryTree, onCancel }: ScanProgressProps) {
  const {
    totalFiles,
    processedFiles,
    currentFile,
    phase,
    estimatedRemainingMs,
    downloadSpeed,
    directoriesFound,
  } = progress

  const isDiscovering = phase === 'discovering'

  const percent = !isDiscovering && totalFiles > 0
    ? Math.round((processedFiles / totalFiles) * 100)
    : 0

  const eta = formatEta(estimatedRemainingMs)
  const speed = formatSpeed(downloadSpeed)

  return (
    <div className="w-full max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span className="text-sm font-medium">{PHASE_LABELS[phase]}</span>
      </div>

      {isDiscovering
        ? (
          <>
            <div className="flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
              {directoriesFound != null && directoriesFound > 0 && (
                <span>
                  Директорий:
                  {' '}
                  {directoriesFound}
                </span>
              )}
              {totalFiles > 0 && (
                <span>
                  Файлов:
                  {' '}
                  {totalFiles}
                </span>
              )}
            </div>

            {directoryTree && directoryTree.length > 0 && (
              <DirectoryTree nodes={directoryTree} />
            )}
          </>
        )
        : (
          <>
            <Progress value={percent} />

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="tabular-nums">
                {processedFiles}
                {' / '}
                {totalFiles}
                {' '}
                файлов
              </span>
              <span className="tabular-nums">
                {percent}
                %
              </span>
            </div>
          </>
        )}

      {!isDiscovering && (eta || speed) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          {eta && <span>{eta}</span>}
          {speed && <span>{speed}</span>}
        </div>
      )}

      {currentFile && (
        <p className="text-xs text-muted-foreground truncate" title={currentFile}>
          {currentFile}
        </p>
      )}

      <Button variant="outline" size="sm" onClick={onCancel}>
        <X className="size-4" />
        Отменить
      </Button>
    </div>
  )
}
