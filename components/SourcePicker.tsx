'use client'

import { useEffect, useState } from 'react'
import { Cloud, FolderOpen } from 'lucide-react'

import { DirectoryPicker } from '@/components/DirectoryPicker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { YANDEX_TOKEN_STORAGE_KEY, YandexDiskConnect } from '@/components/YandexDiskConnect'
import { YandexFolderPicker } from '@/components/YandexFolderPicker'
import type { DirectorySource } from '@/lib/fileSystem'

interface SourcePickerProps {
  onSourceSelected: (source: DirectorySource) => void
  disabled?: boolean
}

export function SourcePicker({ onSourceSelected, disabled }: SourcePickerProps) {
  const [yandexToken, setYandexToken] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('local')

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = sessionStorage.getItem(YANDEX_TOKEN_STORAGE_KEY)
        if (saved) {
          setYandexToken(saved)
          setActiveTab('yandex')
        }
      } catch {
        // sessionStorage недоступен (приватный режим и т.п.)
      }
    })
  }, [])

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-lg">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="local" className="gap-2">
          <FolderOpen className="size-4" />
          Локальная папка
        </TabsTrigger>
        <TabsTrigger value="yandex" className="gap-2">
          <Cloud className="size-4" />
          Яндекс.Диск
        </TabsTrigger>
      </TabsList>

      <TabsContent value="local" className="mt-6">
        <DirectoryPicker
          onDirectorySelected={onSourceSelected}
          disabled={disabled}
        />
      </TabsContent>

      <TabsContent value="yandex" className="mt-6">
        <div className="flex justify-center">
          {yandexToken ? (
            <YandexFolderPicker
              token={yandexToken}
              onScan={folderPaths =>
                onSourceSelected({
                  type: 'yandex',
                  token: yandexToken,
                  folderPaths,
                })
              }
              onDisconnect={() => {
                try {
                  sessionStorage.removeItem(YANDEX_TOKEN_STORAGE_KEY)
                } catch {
                  // ignore
                }

                setYandexToken(null)
              }}
              disabled={disabled}
            />
          ) : (
            <YandexDiskConnect
              onConnected={setYandexToken}
              disabled={disabled}
            />
          )}
        </div>
      </TabsContent>
    </Tabs>
  )
}
