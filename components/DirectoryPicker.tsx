'use client'

import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Monitor } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { DirectorySource } from '@/lib/fileSystem'
import { fromFileList, isFileSystemAccessSupported, pickDirectory } from '@/lib/fileSystem'

interface DirectoryPickerProps {
  onDirectorySelected: (source: DirectorySource) => void
  disabled?: boolean
}

export function DirectoryPicker({ onDirectorySelected, disabled }: DirectoryPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [supportsNativeApi, setSupportsNativeApi] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setSupportsNativeApi(isFileSystemAccessSupported()))
  }, [])

  const handleNativePick = async () => {
    try {
      const source = await pickDirectory()
      onDirectorySelected(source)
    } catch (err) {
      // Пользователь отменил выбор
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      console.error('Ошибка выбора директории:', err)
    }
  }

  const handleFallbackPick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onDirectorySelected(fromFileList(files))
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <FolderOpen className="size-12 text-muted-foreground" />
        <p className="text-center text-muted-foreground text-sm max-w-md">
          Выберите папку с фотографиями. Приложение рекурсивно просканирует все вложенные директории
          и найдёт дубликаты изображений.
        </p>
      </div>

      <Button
        size="lg"
        onClick={supportsNativeApi ? handleNativePick : handleFallbackPick}
        disabled={disabled}
      >
        <FolderOpen className="size-4" />
        Выбрать папку
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        /* @ts-expect-error webkitdirectory is non-standard but widely supported */
        webkitdirectory=""
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {!supportsNativeApi && (
        <Alert>
          <Monitor className="size-4" />
          <AlertDescription>
            Ваш браузер не поддерживает File System Access API.
            Для лучшего опыта используйте Chrome или Edge.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
