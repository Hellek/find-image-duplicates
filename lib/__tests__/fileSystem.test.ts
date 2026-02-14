import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FileEntry } from '../fileSystem'
import {
  fromFileList,
  getFileFromEntry,
  getYandexDiskFolderUrl,
  isFileSystemAccessSupported,
  scanDirectory,
} from '../fileSystem'

// Мокаем yandexDisk чтобы fileSystem.ts мог импортироваться
vi.mock('../yandexDisk', () => ({
  downloadFile: vi.fn(),
  listImageFiles: vi.fn(),
}))

describe('getFileFromEntry', () => {
  it('returns file directly when available', async () => {
    const file = new File(['data'], 'test.jpg')
    const entry: FileEntry = { path: 'test.jpg', file }

    const result = await getFileFromEntry(entry)
    expect(result).toBe(file)
  })

  it('calls getFile() and caches the result', async () => {
    const file = new File(['data'], 'remote.jpg')
    const getFile = vi.fn().mockResolvedValue(file)
    const entry: FileEntry = { path: 'remote.jpg', getFile }

    const result1 = await getFileFromEntry(entry)
    expect(result1).toBe(file)
    expect(getFile).toHaveBeenCalledTimes(1)

    // Второй вызов должен использовать кэш
    const result2 = await getFileFromEntry(entry)
    expect(result2).toBe(file)
    expect(getFile).toHaveBeenCalledTimes(1) // Не вызывается повторно
  })
})

describe('isFileSystemAccessSupported', () => {
  const win = window as unknown as Record<string, unknown>
  const originalShowDirectoryPicker = win.showDirectoryPicker

  afterEach(() => {
    if (originalShowDirectoryPicker !== undefined) {
      win.showDirectoryPicker = originalShowDirectoryPicker
    } else {
      delete win.showDirectoryPicker
    }
  })

  it('returns true when showDirectoryPicker exists', () => {
    win.showDirectoryPicker = vi.fn()
    expect(isFileSystemAccessSupported()).toBe(true)
  })

  it('returns false when showDirectoryPicker is absent', () => {
    delete win.showDirectoryPicker
    expect(isFileSystemAccessSupported()).toBe(false)
  })
})

describe('getYandexDiskFolderUrl', () => {
  it('converts a simple path', () => {
    expect(getYandexDiskFolderUrl('/Photos')).toBe(
      'https://disk.yandex.ru/client/disk/Photos',
    )
  })

  it('handles disk: prefix', () => {
    // После удаления 'disk:' остаётся '/Photos/2024', первый '/' проходит split как пустой сегмент
    expect(getYandexDiskFolderUrl('disk:/Photos/2024')).toBe(
      'https://disk.yandex.ru/client/disk//Photos/2024',
    )
  })

  it('handles root path', () => {
    expect(getYandexDiskFolderUrl('/')).toBe(
      'https://disk.yandex.ru/client/disk/',
    )
  })

  it('encodes special characters', () => {
    expect(getYandexDiskFolderUrl('/Мои фото')).toBe(
      'https://disk.yandex.ru/client/disk/%D0%9C%D0%BE%D0%B8%20%D1%84%D0%BE%D1%82%D0%BE',
    )
  })

  it('handles nested path with disk: prefix', () => {
    expect(getYandexDiskFolderUrl('disk:/A/B/C')).toBe(
      'https://disk.yandex.ru/client/disk//A/B/C',
    )
  })
})

describe('fromFileList', () => {
  it('creates a fileList source', () => {
    const files = { length: 0 } as unknown as FileList
    const source = fromFileList(files)

    expect(source.type).toBe('fileList')
    expect((source as { files: FileList }).files).toBe(files)
  })
})

describe('scanDirectory', () => {
  describe('fileList source', () => {
    function createFileList(files: File[]): FileList {
      const list = {
        length: files.length,
        item: (i: number) => files[i] ?? null,
      } as unknown as FileList

      for (let i = 0; i < files.length; i++) {
        (list as Record<number, File>)[i] = files[i]
      }

      return list
    }

    it('collects image files from FileList', async () => {
      const files = createFileList([
        new File(['img1'], 'photo.jpg', { type: 'image/jpeg' }),
        new File(['img2'], 'image.png', { type: 'image/png' }),
        new File(['doc'], 'readme.txt', { type: 'text/plain' }),
      ])

      // Нужно выставить webkitRelativePath через defineProperty
      Object.defineProperty(files[0], 'webkitRelativePath', { value: 'dir/photo.jpg' })
      Object.defineProperty(files[1], 'webkitRelativePath', { value: 'dir/image.png' })
      Object.defineProperty(files[2], 'webkitRelativePath', { value: 'dir/readme.txt' })

      const onFile = vi.fn()
      const signal = new AbortController().signal

      const result = await scanDirectory({ type: 'fileList', files }, onFile, signal)

      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('dir/photo.jpg')
      expect(result[1].path).toBe('dir/image.png')
      expect(onFile).toHaveBeenCalledTimes(2)
    })

    it('filters by image extensions', async () => {
      const fileNames = [
        'a.jpg', 'b.jpeg', 'c.png', 'd.webp', 'e.gif', 'f.bmp', 'g.avif',
        'h.txt', 'i.pdf', 'j.mp4',
      ]

      const files = createFileList(
        fileNames.map(name => {
          const f = new File(['data'], name)
          Object.defineProperty(f, 'webkitRelativePath', { value: name })
          return f
        }),
      )

      const result = await scanDirectory(
        { type: 'fileList', files },
        vi.fn(),
        new AbortController().signal,
      )

      expect(result).toHaveLength(7)
    })

    it('throws AbortError when signal is aborted', async () => {
      const files = createFileList([
        new File(['img'], 'test.jpg', { type: 'image/jpeg' }),
      ])

      const controller = new AbortController()
      controller.abort()

      await expect(
        scanDirectory({ type: 'fileList', files }, vi.fn(), controller.signal),
      ).rejects.toThrow('Операция отменена')
    })
  })

  describe('handle source', () => {
    function createMockHandle(
      name: string,
      entries: Array<{ kind: 'file' | 'directory'; name: string; file?: File; children?: Array<unknown> }>,
    ): FileSystemDirectoryHandle {
      return {
        kind: 'directory',
        name,
        values: async function* () {
          for (const entry of entries) {
            if (entry.kind === 'file') {
              yield {
                kind: 'file' as const,
                name: entry.name,
                getFile: () => Promise.resolve(entry.file ?? new File(['data'], entry.name)),
              } as unknown as FileSystemFileHandle
            } else {
              yield createMockHandle(
                entry.name,
                entry.children as Array<{ kind: 'file' | 'directory'; name: string; file?: File; children?: Array<unknown> }>,
              ) as unknown as FileSystemDirectoryHandle
            }
          }
        },
      } as unknown as FileSystemDirectoryHandle
    }

    it('scans directory recursively', async () => {
      const handle = createMockHandle('root', [
        { kind: 'file', name: 'photo.jpg' },
        {
          kind: 'directory',
          name: 'sub',
          children: [
            { kind: 'file', name: 'nested.png' },
            { kind: 'file', name: 'doc.txt' },
          ],
        },
      ])

      const onFile = vi.fn()

      const result = await scanDirectory(
        { type: 'handle', handle },
        onFile,
        new AbortController().signal,
      )

      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('photo.jpg')
      expect(result[1].path).toBe('sub/nested.png')
      expect(onFile).toHaveBeenCalledTimes(2)
    })
  })
})
