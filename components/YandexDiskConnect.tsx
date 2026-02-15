'use client'

import { useEffect, useState } from 'react'
import {
  Cloud,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  X,
} from 'lucide-react'

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
  'https://yandex.ru/dev/disk-api/doc/ru/concepts/quickstart'
  + '#quickstart__oauth'

const OAUTH_AUTHORIZE_URL =
  'https://oauth.yandex.ru/authorize?response_type=token&client_id='

export const YANDEX_TOKEN_STORAGE_KEY = 'yandex_disk_token'
export const CLIENT_IDS_STORAGE_KEY = 'yandex_disk_client_ids'

/** Загружает сохранённые Client ID из localStorage */
function loadClientIds(): string[] {
  try {
    const raw = localStorage.getItem(CLIENT_IDS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Сохраняет список Client ID в localStorage */
function saveClientIds(ids: string[]) {
  try {
    localStorage.setItem(
      CLIENT_IDS_STORAGE_KEY,
      JSON.stringify(ids),
    )
  } catch {
    // localStorage недоступен
  }
}

interface YandexDiskConnectProps {
  onConnected: (token: string) => void
  disabled?: boolean
}

export function YandexDiskConnect({
  onConnected,
  disabled,
}: YandexDiskConnectProps) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [clientIds, setClientIds] = useState<string[]>([])
  const [newClientId, setNewClientId] = useState('')

  // Загружаем сохранённые Client ID при монтировании
  useEffect(() => {
    queueMicrotask(() => {
      setClientIds(loadClientIds())
    })
  }, [])

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
      const res = await fetch(
        'https://cloud-api.yandex.net/v1/disk/',
        { headers: { Authorization: `OAuth ${trimmed}` } },
      )

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(
            'Неверный токен. Проверьте правильность'
            + ' и срок действия.',
          )
        }

        throw new Error(`Ошибка: ${res.status}`)
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(
          YANDEX_TOKEN_STORAGE_KEY,
          trimmed,
        )
      }

      onConnected(trimmed)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Не удалось подключиться',
      )
    } finally {
      setIsVerifying(false)
    }
  }

  /** Открывает OAuth-страницу Яндекса для получения токена */
  const openOAuth = (clientId: string) => {
    window.open(
      OAUTH_AUTHORIZE_URL + encodeURIComponent(clientId),
      '_blank',
    )
  }

  /**
   * Добавляет новый Client ID, сохраняет в localStorage
   * и открывает OAuth-ссылку
   */
  const handleAddClientId = () => {
    const trimmed = newClientId.trim()
    if (!trimmed) return

    const updated = clientIds.includes(trimmed)
      ? clientIds
      : [...clientIds, trimmed]

    setClientIds(updated)
    saveClientIds(updated)
    setNewClientId('')
    openOAuth(trimmed)
  }

  /** Удаляет Client ID из сохранённых */
  const handleRemoveClientId = (id: string) => {
    const updated = clientIds.filter(cid => cid !== id)
    setClientIds(updated)
    saveClientIds(updated)
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cloud className="size-5" />
          Подключение к Яндекс.Диску
        </CardTitle>
        <CardDescription>
          Только чтение. Требуется право
          cloud_api:disk.read. При ошибках CORS
          разверните приложение на Vercel или запустите
          через npm run dev.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* --- Ввод токена --- */}
        <div className="space-y-2">
          <label
            htmlFor="yandex-token"
            className="text-sm font-medium"
          >
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
            className={[
              'w-full rounded-md border border-input',
              'bg-background px-3 py-2 text-sm',
              'ring-offset-background',
              'placeholder:text-muted-foreground',
              'focus-visible:outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-ring',
              'focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed',
              'disabled:opacity-50',
            ].join(' ')}
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
            className={[
              'text-muted-foreground',
              'hover:text-foreground',
              'flex items-center justify-center',
              'gap-1.5 text-xs transition-colors',
            ].join(' ')}
          >
            Как получить токен
            <ExternalLink className="size-3" />
          </a>
        </div>

        {/* --- Разделитель --- */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div
            className={[
              'relative flex justify-center',
              'text-xs uppercase',
            ].join(' ')}
          >
            <span
              className={[
                'bg-card px-2',
                'text-muted-foreground',
              ].join(' ')}
            >
              или получить токен по Client ID
            </span>
          </div>
        </div>

        {/* --- Получение токена по Client ID --- */}
        <div className="space-y-3">
          {clientIds.length > 0 && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">
                Сохранённые Client ID:
              </p>
              <div className="flex flex-col gap-1.5">
                {clientIds.map(id => (
                  <div
                    key={id}
                    className="flex items-center gap-1.5"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className={[
                        'flex-1 justify-start',
                        'font-mono text-xs',
                      ].join(' ')}
                      onClick={() => openOAuth(id)}
                      disabled={disabled}
                    >
                      <KeyRound
                        className="size-3.5 shrink-0"
                      />
                      <span className="truncate">{id}</span>
                      <ExternalLink
                        className="ml-auto size-3 shrink-0"
                      />
                    </Button>
                    <button
                      type="button"
                      className={[
                        'text-muted-foreground',
                        'hover:text-destructive',
                        'rounded p-1 transition-colors',
                      ].join(' ')}
                      onClick={() =>
                        handleRemoveClientId(id)
                      }
                      aria-label={`Удалить ${id}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <input
              id="new-client-id"
              type="text"
              value={newClientId}
              onChange={e => setNewClientId(e.target.value)}
              placeholder={
                clientIds.length > 0
                  ? 'Новый Client ID...'
                  : 'Введите Client ID...'
              }
              className={[
                'flex-1 rounded-md border border-input',
                'bg-background px-3 py-2',
                'text-sm font-mono',
                'ring-offset-background',
                'placeholder:text-muted-foreground',
                'placeholder:font-sans',
                'focus-visible:outline-none',
                'focus-visible:ring-2',
                'focus-visible:ring-ring',
                'focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed',
                'disabled:opacity-50',
              ].join(' ')}
              disabled={disabled}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddClientId()
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleAddClientId}
              disabled={disabled || !newClientId.trim()}
              title="Добавить и получить токен"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
