'use client'

import { useCallback, useRef, useState } from 'react'

import { DuplicateResults } from '@/components/DuplicateResults'
import { Header } from '@/components/Header'
import { ScanProgress } from '@/components/ScanProgress'
import type { SearchMode } from '@/components/SearchModeSelector'
import { SearchModeSelector } from '@/components/SearchModeSelector'
import { SourcePicker } from '@/components/SourcePicker'
import { ThresholdSlider } from '@/components/ThresholdSlider'
import type { DuplicateGroup, ScanProgress as ScanProgressData } from '@/lib/duplicateFinder'
import { findExactDuplicates, findSimilarDuplicates } from '@/lib/duplicateFinder'
import type { DirectorySource } from '@/lib/fileSystem'
import { scanDirectory } from '@/lib/fileSystem'

type AppState = 'idle' | 'scanning' | 'processing' | 'results'

export default function HomePage() {
  const [appState, setAppState] = useState<AppState>('idle')
  const [searchMode, setSearchMode] = useState<SearchMode>('exact')
  const [threshold, setThreshold] = useState(10)

  const [progress, setProgress] = useState<ScanProgressData>({
    totalFiles: 0,
    processedFiles: 0,
    currentFile: '',
    phase: 'scanning',
  })

  const [results, setResults] = useState<DuplicateGroup[]>([])
  const [totalFiles, setTotalFiles] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)

  const handleDirectorySelected = useCallback(async (source: DirectorySource) => {
    setAppState('scanning')
    setError(null)
    setResults([])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // Фаза 1: сканирование — собираем все файлы
      setProgress({
        totalFiles: 0,
        processedFiles: 0,
        currentFile: '',
        phase: 'scanning',
      })

      let foundCount = 0

      const files = await scanDirectory(
        source,
        entry => {
          foundCount += 1
          setProgress({
            totalFiles: foundCount,
            processedFiles: 0,
            currentFile: entry.path,
            phase: 'scanning',
          })
        },
        controller.signal,
      )

      if (files.length === 0) {
        setError('Изображения не найдены в выбранной директории')
        setAppState('idle')
        return
      }

      setTotalFiles(files.length)
      setAppState('processing')

      // Фаза 2: хэширование и сравнение
      let groups: DuplicateGroup[]

      if (searchMode === 'exact') {
        groups = await findExactDuplicates(files, setProgress, controller.signal)
      } else {
        groups = await findSimilarDuplicates(files, threshold, setProgress, controller.signal)
      }

      setResults(groups)
      setAppState('results')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setAppState('idle')
        return
      }

      console.error('Ошибка при поиске дубликатов:', err)
      setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка')
      setAppState('idle')
    } finally {
      abortControllerRef.current = null
    }
  }, [searchMode, threshold])

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleReset = useCallback(() => {
    setAppState('idle')
    setResults([])
    setTotalFiles(0)
    setError(null)
  }, [])

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto max-w-5xl px-4 py-8">
        <div className="flex flex-col items-center gap-8">
          {/* Начальный экран */}
          {appState === 'idle' && (
            <>
              <SearchModeSelector value={searchMode} onChange={setSearchMode} />

              {searchMode === 'similar' && (
                <ThresholdSlider value={threshold} onChange={setThreshold} />
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <SourcePicker onSourceSelected={handleDirectorySelected} />
            </>
          )}

          {/* Сканирование / обработка */}
          {(appState === 'scanning' || appState === 'processing') && (
            <ScanProgress progress={progress} onCancel={handleCancel} />
          )}

          {/* Результаты */}
          {appState === 'results' && (
            <DuplicateResults
              groups={results}
              totalFiles={totalFiles}
              mode={searchMode}
              onReset={handleReset}
            />
          )}
        </div>
      </main>
    </div>
  )
}
