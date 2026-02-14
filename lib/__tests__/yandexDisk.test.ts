import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  downloadFile,
  listFolderContents,
  listFolderTree,
  listImageFiles,
  sanitizeToken,
  type YandexResource,
} from '../yandexDisk'

// Глобальный мок fetch
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('sanitizeToken', () => {
  it('trims whitespace', () => {
    expect(sanitizeToken('  abc123  ')).toBe('abc123')
  })

  it('removes zero-width spaces', () => {
    expect(sanitizeToken('abc\u200Bdef')).toBe('abcdef')
  })

  it('removes BOM', () => {
    expect(sanitizeToken('\uFEFFtoken')).toBe('token')
  })

  it('removes non-ISO-8859-1 characters', () => {
    expect(sanitizeToken('token\u0400value')).toBe('tokenvalue')
  })

  it('handles combined issues', () => {
    expect(sanitizeToken('  \u200B abc\uFEFF\u0400 ')).toBe('abc')
  })

  it('returns empty string for only whitespace', () => {
    expect(sanitizeToken('   ')).toBe('')
  })
})

describe('listImageFiles', () => {
  it('fetches all images via flat list when no folders specified', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        items: [
          { name: 'photo.jpg', path: 'disk:/photo.jpg', type: 'file', mime_type: 'image/jpeg', size: 1000 },
          { name: 'doc.pdf', path: 'disk:/doc.pdf', type: 'file', mime_type: 'application/pdf', size: 500 },
        ],
        limit: 1000,
        offset: 0,
      }),
    })

    const onFile = vi.fn()
    const results = await listImageFiles('token123', [], onFile)

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('photo.jpg')
    expect(onFile).toHaveBeenCalledTimes(1)

    // Проверяем URL запроса
    const url = new URL(mockFetch.mock.calls[0][0])
    expect(url.pathname).toBe('/v1/disk/resources/files')
    expect(url.searchParams.get('media_type')).toBe('image,unknown')
  })

  it('handles pagination', async () => {
    // Первая страница — полная (1000 элементов)
    const page1Items: YandexResource[] = Array.from({ length: 1000 }, (_, i) => ({
      name: `img${i}.jpg`,
      path: `disk:/img${i}.jpg`,
      type: 'file' as const,
      mime_type: 'image/jpeg',
      size: 100,
    }))

    // Вторая страница — неполная (завершаем)
    const page2Items: YandexResource[] = [
      { name: 'last.jpg', path: 'disk:/last.jpg', type: 'file', mime_type: 'image/jpeg', size: 100 },
    ]

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: page1Items, limit: 1000, offset: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: page2Items, limit: 1000, offset: 1000 }),
      })

    const results = await listImageFiles('token', [], vi.fn())
    expect(results).toHaveLength(1001)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('fetches from specific folders recursively', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        _embedded: {
          items: [
            { name: 'photo.png', path: 'disk:/Photos/photo.png', type: 'file', mime_type: 'image/png', size: 500 },
          ],
          path: 'disk:/Photos',
        },
      }),
    })

    const onFile = vi.fn()
    const results = await listImageFiles('token', ['/Photos'], onFile)

    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('photo.png')
  })

  it('throws AbortError when aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      listImageFiles('token', [], vi.fn(), controller.signal),
    ).rejects.toThrow('Операция отменена')
  })

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden', error: 'ForbiddenError' }),
    })

    await expect(
      listImageFiles('token', [], vi.fn()),
    ).rejects.toThrow('Forbidden')
  })
})

describe('listFolderContents', () => {
  it('returns items from folder', async () => {
    const items = [
      { name: 'sub', path: 'disk:/root/sub', type: 'dir' },
      { name: 'file.jpg', path: 'disk:/root/file.jpg', type: 'file', mime_type: 'image/jpeg', size: 100 },
    ]

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ _embedded: { items } }),
    })

    const result = await listFolderContents('token', '/root')

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('sub')

    const url = new URL(mockFetch.mock.calls[0][0])
    expect(url.searchParams.get('path')).toBe('disk:/root')
  })

  it('handles disk: prefix in path', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ _embedded: { items: [] } }),
    })

    await listFolderContents('token', 'disk:/Photos')

    const url = new URL(mockFetch.mock.calls[0][0])
    expect(url.searchParams.get('path')).toBe('disk:/Photos')
  })

  it('returns empty array when _embedded is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    })

    const result = await listFolderContents('token', '/')
    expect(result).toEqual([])
  })
})

describe('listFolderTree', () => {
  it('recursively collects subdirectories', async () => {
    // Корневой запрос — 2 папки
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        _embedded: {
          items: [
            { name: 'A', path: 'disk:/A', type: 'dir' },
            { name: 'B', path: 'disk:/B', type: 'dir' },
          ],
        },
      }),
    })

    // Подпапка A — пуста
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ _embedded: { items: [] } }),
    })

    // Подпапка B — пуста
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ _embedded: { items: [] } }),
    })

    const onFolder = vi.fn()
    await listFolderTree('token', '/', onFolder)

    expect(onFolder).toHaveBeenCalledTimes(2)
    expect(onFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'A', type: 'dir' }),
    )
    expect(onFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'B', type: 'dir' }),
    )
  })
})

describe('downloadFile', () => {
  it('downloads file via two-step process', async () => {
    const resource: YandexResource = {
      name: 'photo.jpg',
      path: 'disk:/photo.jpg',
      type: 'file',
      mime_type: 'image/jpeg',
      size: 5000,
    }

    // Шаг 1: получаем download URL
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ href: 'https://downloader.disk.yandex.ru/file123' }),
    })

    // Шаг 2: скачиваем файл
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(['image data'], { type: 'image/jpeg' })),
    })

    const file = await downloadFile('token', resource)

    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe('photo.jpg')
    expect(file.type).toBe('image/jpeg')

    // Проверяем первый запрос (download URL)
    const url1 = new URL(mockFetch.mock.calls[0][0])
    expect(url1.pathname).toBe('/v1/disk/resources/download')
    expect(url1.searchParams.get('path')).toBe('disk:/photo.jpg')

    // Проверяем второй запрос (скачивание)
    expect(mockFetch.mock.calls[1][0]).toBe('https://downloader.disk.yandex.ru/file123')
  })

  it('throws on download failure', async () => {
    const resource: YandexResource = {
      name: 'fail.jpg',
      path: 'disk:/fail.jpg',
      type: 'file',
      mime_type: 'image/jpeg',
      size: 100,
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ href: 'https://downloader.disk.yandex.ru/fail' }),
    })

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    })

    await expect(downloadFile('token', resource)).rejects.toThrow(
      'Не удалось скачать файл: fail.jpg (500)',
    )
  })

  it('uses default mime type when not provided', async () => {
    const resource: YandexResource = {
      name: 'unknown.dat',
      path: 'disk:/unknown.dat',
      type: 'file',
      mime_type: '',
      size: 100,
    }

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ href: 'https://dl.yandex.ru/x' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob(['data'])),
      })

    const file = await downloadFile('token', resource)
    expect(file.type).toBe('application/octet-stream')
  })
})
