'use client'

import { useState } from 'react'
import { Cloud, ExternalLink, Loader2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { sanitizeToken } from '@/lib/yandexDisk'

const OAUTH_HELP_URL =
  'https://yandex.ru/dev/disk-api/doc/ru/concepts/quickstart#quickstart__oauth'

export const YANDEX_TOKEN_STORAGE_KEY = 'yandex_disk_token'

interface YandexDiskConnectProps {
  onConnected: (token: string) => void
  disabled?: boolean
}

export function YandexDiskConnect({ onConnected, disabled }: YandexDiskConnectProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)

  const handleConnect = async () => {
    const trimmed = sanitizeToken(token)
    if (!trimmed) {
      setError('Введите OAuth-токен')
      return
    }

    setError(null)
    setIsVerifying(true)

    try {
      // Проверяем токен запросом к API
      const res = await fetch('https://cloud-api.yandex.net/v1/disk/', {
        headers: { Authorization: `OAuth ${trimmed}` },
      })

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Неверный токен. Проверьте правильность и срок действия.')
        }

        throw new Error(`Ошибка: ${res.status}`)
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(YANDEX_TOKEN_STORAGE_KEY, trimmed)
      }

      onConnected(trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подключиться')
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-5" />
          Подключение к Яндекс.Диску
        </CardTitle>
        <CardDescription>
          Только чтение. Требуется право cloud_api:disk.read. При ошибках CORS разверните приложение
          на Vercel или запустите через npm run dev.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="yandex-token" className="text-sm font-medium">
            OAuth-токен
          </label>
          <input
            id="yandex-token"
            type="password"
            value={token}
            onChange={e => {
              setToken(e.target.value)
              setError(null)
            }}
            placeholder="Вставьте токен..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            autoComplete="off"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleConnect}
            disabled={disabled || isVerifying}
            className="w-full"
          >
            {isVerifying ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Проверка...
              </>
            ) : (
              <>
                <Cloud className="size-4" />
                Подключиться
              </>
            )}
          </Button>

          <a
            href={OAUTH_HELP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 text-xs transition-colors"
          >
            Как получить токен
            <ExternalLink className="size-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
