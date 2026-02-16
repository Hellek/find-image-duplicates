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
import type { DirectorySource, DirectoryTreeNode } from '@/lib/fileSystem'
import { collectFileEntries, discoverFiles } from '@/lib/fileSystem'

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
  const [directoryTree, setDirectoryTree] = useState<DirectoryTreeNode[]>([])

  const abortControllerRef = useRef<AbortController | null>(null)

  const handleDirectorySelected = useCallback(async (source: DirectorySource) => {
    setAppState('scanning')
    setError(null)
    setResults([])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      // Фаза 1: обнаружение — рекурсивный поиск субдиректорий и подсчёт файлов
      setDirectoryTree([])
      setProgress({
        totalFiles: 0,
        processedFiles: 0,
        currentFile: '',
        phase: 'discovering',
        directoriesFound: 0,
      })

      const discovery = await discoverFiles(
        source,
        info => {
          setProgress({
            totalFiles: info.filesFound,
            processedFiles: 0,
            currentFile: info.currentDirectory,
            phase: 'discovering',
            directoriesFound: info.directoriesFound,
          })

          if (info.directoryTree) {
            setDirectoryTree(info.directoryTree)
          }
        },
        controller.signal,
      )

      if (discovery.totalFiles === 0) {
        setError('Изображения не найдены в выбранной директории')
        setAppState('idle')
        return
      }

      // Фаза 2: сбор данных файлов
      let collectedCount = 0

      setProgress({
        totalFiles: discovery.totalFiles,
        processedFiles: 0,
        currentFile: '',
        phase: 'scanning',
      })

      const files = await collectFileEntries(
        discovery,
        entry => {
          collectedCount += 1
          setProgress({
            totalFiles: discovery.totalFiles,
            processedFiles: collectedCount,
            currentFile: entry.path,
            phase: 'scanning',
          })
        },
        controller.signal,
      )

      setTotalFiles(files.length)
      setAppState('processing')

      // Фаза 3: хэширование и сравнение
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
    setDirectoryTree([])
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
            <ScanProgress
              progress={progress}
              directoryTree={directoryTree}
              onCancel={handleCancel}
            />
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
