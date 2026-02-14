/**
 * Клиент API Яндекс.Диска (только чтение).
 * Использует OAuth-токен для авторизации.
 * Через прокси /api/yandex/* для обхода CORS в браузере.
 * @see https://yandex.ru/dev/disk-api/doc/ru/
 */

const API_BASE = 'https://cloud-api.yandex.net/v1/disk'

export interface YandexResource {
  name: string
  path: string
  type: 'file'
  mime_type: string
  size: number
  preview?: string
}

export interface YandexFolderResource {
  name: string
  path: string
  type: 'dir'
}

export type YandexFolderItem = YandexResource | YandexFolderResource

export interface YandexFolderContents {
  _embedded?: {
    items: YandexFolderItem[]
    path: string
  }
}

interface FilesListResponse {
  items: YandexResource[]
  limit: number
  offset: number
}

interface YandexApiError {
  error: string
  message: string
  description?: string
}

/** Очищает токен от символов вне ISO-8859-1 (fetch требует это для заголовков). */
export function sanitizeToken(token: string): string {
  return token
    .trim()
    .replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\x00-\xFF]/g, '')
}

function getAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `OAuth ${sanitizeToken(token)}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

async function checkResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Ошибка API: ${res.status}`

    try {
      const err: YandexApiError = await res.json()
      message = err.message || err.description || message
    } catch {
      // ignore
    }

    throw new Error(message)
  }
  return res.json() as Promise<T>
}

const IMAGE_EXTS = /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i

const isImageFile = (r: YandexResource) =>
  r.mime_type?.startsWith('image/') || IMAGE_EXTS.test(r.name)

/**
 * Рекурсивно собирает изображения из папки через resources API.
 */
async function listImagesFromFolder(
  token: string,
  folderPath: string,
  results: YandexResource[],
  onFile: (resource: YandexResource) => void,
  signal?: AbortSignal,
): Promise<void> {
  let offset = 0
  const limit = 1000

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const url = new URL(`${API_BASE}/resources`)
    url.searchParams.set('path', folderPath.startsWith('disk:') ? folderPath : `disk:${folderPath || '/'}`)
    url.searchParams.set(
      'fields',
      '_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.mime_type,_embedded.items.size,_embedded.items.preview',
    )
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))

    const res = await fetch(url.toString(), {
      headers: getAuthHeaders(token),
      signal,
    })

    const data = await checkResponse<YandexFolderContents>(res)
    const items = data._embedded?.items ?? []

    for (const item of items) {
      if (item.type === 'file' && isImageFile(item)) {
        results.push(item)
        onFile(item)
      } else if (item.type === 'dir') {
        await listImagesFromFolder(token, item.path, results, onFile, signal)
      }
    }

    if (items.length < limit) {
      break
    }

    offset += limit
  }
}

/**
 * Собирает изображения: при выборе папок — рекурсивно через resources API,
 * при пустом выборе — плоский список через all-files.
 */
export async function listImageFiles(
  token: string,
  folderPaths: string[],
  onFile: (resource: YandexResource) => void,
  signal?: AbortSignal,
): Promise<YandexResource[]> {
  const results: YandexResource[] = []

  if (folderPaths.length > 0) {
    for (const folderPath of folderPaths) {
      await listImagesFromFolder(token, folderPath, results, onFile, signal)
    }
    return results
  }

  let offset = 0
  const limit = 1000

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const url = new URL(`${API_BASE}/resources/files`)
    url.searchParams.set('media_type', 'image,unknown')
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))
    url.searchParams.set('fields', 'items.name,items.path,items.type,items.mime_type,items.size,items.preview')

    const res = await fetch(url.toString(), {
      headers: getAuthHeaders(token),
      signal,
    })

    const data = await checkResponse<FilesListResponse>(res)

    for (const item of data.items) {
      if (item.type !== 'file' || !isImageFile(item)) continue
      results.push(item)
      onFile(item)
    }

    if (data.items.length < limit) {
      break
    }

    offset += limit
  }

  return results
}

/**
 * Возвращает содержимое папки (подпапки и файлы).
 */
export async function listFolderContents(
  token: string,
  path: string,
  signal?: AbortSignal,
): Promise<YandexFolderItem[]> {
  const url = new URL(`${API_BASE}/resources`)
  url.searchParams.set('path', path.startsWith('disk:') ? path : `disk:${path || '/'}`)
  url.searchParams.set(
    'fields',
    '_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.items.mime_type,_embedded.items.size',
  )
  url.searchParams.set('limit', '1000')

  const res = await fetch(url.toString(), {
    headers: getAuthHeaders(token),
    signal,
  })

  const data = await checkResponse<YandexFolderContents>(res)
  return data._embedded?.items ?? []
}

/**
 * Рекурсивно собирает все подпапки начиная с path.
 */
export async function listFolderTree(
  token: string,
  path: string,
  onFolder: (item: YandexFolderResource) => void,
  signal?: AbortSignal,
): Promise<void> {
  const items = await listFolderContents(token, path, signal)
  for (const item of items) {
    if (item.type === 'dir') {
      onFolder(item)
      await listFolderTree(token, item.path, onFolder, signal)
    }
  }
}

/**
 * Получает URL для скачивания файла.
 */
async function getDownloadUrl(token: string, path: string, signal?: AbortSignal): Promise<string> {
  const url = new URL(`${API_BASE}/resources/download`)
  url.searchParams.set('path', path)

  const res = await fetch(url.toString(), {
    headers: getAuthHeaders(token),
    signal,
  })

  const data = await checkResponse<{ href: string }>(res)
  return data.href
}

/**
 * Скачивает файл с Яндекс.Диска и возвращает File.
 * OAuth-токен передаётся в заголовке при запросе href.
 */
export async function downloadFile(
  token: string,
  resource: YandexResource,
  signal?: AbortSignal,
): Promise<File> {
  const href = await getDownloadUrl(token, resource.path, signal)

  const res = await fetch(href, {
    headers: { Authorization: `OAuth ${sanitizeToken(token)}` },
    signal,
  })

  if (!res.ok) {
    throw new Error(`Не удалось скачать файл: ${resource.name} (${res.status})`)
  }

  const blob = await res.blob()
  return new File([blob], resource.name, { type: resource.mime_type || 'application/octet-stream' })
}
