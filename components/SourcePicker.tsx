'use client'

import { useLayoutEffect, useState } from 'react'
import { Cloud, FolderOpen } from 'lucide-react'

import { DirectoryPicker } from '@/components/DirectoryPicker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CLIENT_IDS_STORAGE_KEY,
  YANDEX_TOKEN_STORAGE_KEY,
  YandexDiskConnect,
} from '@/components/YandexDiskConnect'
import { YandexFolderPicker } from '@/components/YandexFolderPicker'
import type { DirectorySource } from '@/lib/fileSystem'

interface SourcePickerProps {
  onSourceSelected: (source: DirectorySource) => void
  disabled?: boolean
}

export function SourcePicker({ onSourceSelected, disabled }: SourcePickerProps) {
  const [yandexToken, setYandexToken] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('local')

  // useLayoutEffect выполняется ПОСЛЕ коммита DOM, но ДО
  // отрисовки браузером — гидрация проходит без ошибок,
  // а пользователь не видит моргания при смене вкладки.
  // setState напрямую — намеренно: queueMicrotask здесь
  // приведёт к морганию, т.к. браузер успеет отрисовать
  // кадр до обработки микрозадачи.
  useLayoutEffect(() => {
    try {
      const saved = sessionStorage.getItem(
        YANDEX_TOKEN_STORAGE_KEY,
      )

      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-paint
        setYandexToken(saved)
        setActiveTab('yandex')
        return
      }
    } catch {
      // sessionStorage недоступен (приватный режим и т.п.)
    }

    try {
      const raw = localStorage.getItem(CLIENT_IDS_STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      const ids = Array.isArray(parsed) ? parsed : []

      if (ids.length > 0) {
        setActiveTab('yandex')
      }
    } catch {
      // localStorage недоступен
    }
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
