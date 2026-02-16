import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FileEntry } from '../fileSystem'
import {
  collectFileEntries,
  discoverFiles,
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

const { listImageFiles } = await import('../yandexDisk')
const mockListImageFiles = vi.mocked(listImageFiles)

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

// Общий хелпер для создания мокового FileSystemDirectoryHandle
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

// Общий хелпер для создания мокового FileList
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

describe('discoverFiles', () => {
  describe('handle source', () => {
    it('discovers directories and counts image files without reading content', async () => {
      const handle = createMockHandle('root', [
        { kind: 'file', name: 'photo.jpg' },
        { kind: 'file', name: 'readme.txt' },
        {
          kind: 'directory',
          name: 'sub',
          children: [
            { kind: 'file', name: 'nested.png' },
            { kind: 'file', name: 'doc.txt' },
            {
              kind: 'directory',
              name: 'deep',
              children: [
                { kind: 'file', name: 'deep.gif' },
              ],
            },
          ],
        },
      ])

      const onProgress = vi.fn()

      const result = await discoverFiles(
        { type: 'handle', handle },
        onProgress,
        new AbortController().signal,
      )

      expect(result.totalFiles).toBe(3) // photo.jpg, nested.png, deep.gif
      expect(result.totalDirectories).toBe(3) // root, sub, deep
      expect(result.type).toBe('handle')
      expect(onProgress).toHaveBeenCalled()
    })

    it('builds directory tree with completed status', async () => {
      const handle = createMockHandle('root', [
        { kind: 'file', name: 'photo.jpg' },
        {
          kind: 'directory',
          name: 'sub',
          children: [
            { kind: 'file', name: 'nested.png' },
          ],
        },
      ])

      const onProgress = vi.fn()

      await discoverFiles(
        { type: 'handle', handle },
        onProgress,
        new AbortController().signal,
      )

      // Последний вызов должен содержать полное дерево, всё completed
      const lastCallWithTree = [...onProgress.mock.calls]
        .reverse()
        .find(call => call[0].directoryTree != null)

      expect(lastCallWithTree).toBeDefined()

      const tree = lastCallWithTree![0].directoryTree
      expect(tree).toHaveLength(1)
      expect(tree[0].name).toBe('root')
      expect(tree[0].completed).toBe(true)
      expect(tree[0].fileCount).toBe(1) // photo.jpg
      expect(tree[0].children).toHaveLength(1)
      expect(tree[0].children[0].name).toBe('sub')
      expect(tree[0].children[0].completed).toBe(true)
      expect(tree[0].children[0].fileCount).toBe(1) // nested.png
    })

    it('throws AbortError when signal is aborted', async () => {
      const handle = createMockHandle('root', [
        { kind: 'file', name: 'photo.jpg' },
      ])

      const controller = new AbortController()
      controller.abort()

      await expect(
        discoverFiles({ type: 'handle', handle }, vi.fn(), controller.signal),
      ).rejects.toThrow('Операция отменена')
    })
  })

  describe('fileList source', () => {
    it('discovers directories and counts image files', async () => {
      const files = createFileList([
        new File(['img1'], 'photo.jpg', { type: 'image/jpeg' }),
        new File(['img2'], 'image.png', { type: 'image/png' }),
        new File(['doc'], 'readme.txt', { type: 'text/plain' }),
      ])

      Object.defineProperty(files[0], 'webkitRelativePath', { value: 'dir/photo.jpg' })
      Object.defineProperty(files[1], 'webkitRelativePath', { value: 'dir/sub/image.png' })
      Object.defineProperty(files[2], 'webkitRelativePath', { value: 'dir/readme.txt' })

      const onProgress = vi.fn()

      const result = await discoverFiles(
        { type: 'fileList', files },
        onProgress,
        new AbortController().signal,
      )

      expect(result.totalFiles).toBe(2) // photo.jpg, image.png
      expect(result.totalDirectories).toBe(2) // dir, dir/sub
      expect(result.type).toBe('fileList')
    })

    it('builds directory tree from file paths with all completed', async () => {
      const files = createFileList([
        new File(['img1'], 'photo.jpg', { type: 'image/jpeg' }),
        new File(['img2'], 'image.png', { type: 'image/png' }),
      ])

      Object.defineProperty(files[0], 'webkitRelativePath', { value: 'dir/photo.jpg' })
      Object.defineProperty(files[1], 'webkitRelativePath', { value: 'dir/sub/image.png' })

      const onProgress = vi.fn()

      await discoverFiles(
        { type: 'fileList', files },
        onProgress,
        new AbortController().signal,
      )

      const lastCall = onProgress.mock.calls.at(-1)![0]
      expect(lastCall.directoryTree).toBeDefined()

      const tree = lastCall.directoryTree
      expect(tree).toHaveLength(1) // dir — корень
      expect(tree[0].name).toBe('dir')
      expect(tree[0].completed).toBe(true)
      expect(tree[0].fileCount).toBe(1)
      expect(tree[0].children).toHaveLength(1)
      expect(tree[0].children[0].name).toBe('sub')
      expect(tree[0].children[0].completed).toBe(true)
      expect(tree[0].children[0].fileCount).toBe(1)
    })
  })

  describe('yandex source', () => {
    afterEach(() => {
      mockListImageFiles.mockReset()
    })

    it('does not create duplicate tree nodes when directory is visited twice', async () => {
      mockListImageFiles.mockImplementation(
        // Имитируем повторное посещение одной директории (перекрывающиеся папки)
        async (_token, _paths, _onFile, _signal, onDir, onDirComplete) => {
          onDir?.('disk:/Photos')
          onDir?.('disk:/Photos') // дубликат!
          onDirComplete?.('disk:/Photos')
          onDirComplete?.('disk:/Photos')
          return []
        },
      )

      const onProgress = vi.fn()

      await discoverFiles(
        { type: 'yandex', token: 'test', folderPaths: ['/Photos'] },
        onProgress,
        new AbortController().signal,
      )

      // Находим все снимки дерева
      const treeCalls = onProgress.mock.calls
        .filter(call => call[0].directoryTree != null)
        .map(call => call[0].directoryTree)

      expect(treeCalls.length).toBeGreaterThan(0)

      // Ни один снимок не должен содержать дубликатов
      for (const tree of treeCalls) {
        const paths = tree.map((n: { path: string }) => n.path)
        expect(new Set(paths).size).toBe(paths.length)
      }

      // Финальное дерево — ровно 1 узел
      const lastTree = treeCalls.at(-1)!
      expect(lastTree).toHaveLength(1)
      expect(lastTree[0].name).toBe('Photos')
      expect(lastTree[0].completed).toBe(true)
    })

    it('builds nested tree from yandex directory traversal', async () => {
      mockListImageFiles.mockImplementation(
        // Имитируем обход: /Photos → /Photos/2020 → файл → выход
        async (_token, _paths, onFile, _signal, onDir, onDirComplete) => {
          onDir?.('disk:/Photos')
          onDir?.('disk:/Photos/2020')

          const resource = {
            name: 'img.jpg',
            path: 'disk:/Photos/2020/img.jpg',
            type: 'file' as const,
            size: 1000,
            md5: 'abc',
            sha256: 'def',
            mime_type: 'image/jpeg',
            created: '',
            modified: '',
            preview: '',
          }

          onFile(resource)
          onDirComplete?.('disk:/Photos/2020')
          onDirComplete?.('disk:/Photos')
          return [resource]
        },
      )

      const onProgress = vi.fn()

      const result = await discoverFiles(
        { type: 'yandex', token: 'test', folderPaths: ['/Photos'] },
        onProgress,
        new AbortController().signal,
      )

      expect(result.type).toBe('yandex')
      expect(result.totalFiles).toBe(1)
      expect(result.totalDirectories).toBe(2) // Photos, Photos/2020

      // Проверяем структуру дерева
      const lastTreeCall = [...onProgress.mock.calls]
        .reverse()
        .find(call => call[0].directoryTree != null)

      expect(lastTreeCall).toBeDefined()

      const tree = lastTreeCall![0].directoryTree
      expect(tree).toHaveLength(1)
      expect(tree[0].name).toBe('Photos')
      expect(tree[0].completed).toBe(true)
      expect(tree[0].children).toHaveLength(1)
      expect(tree[0].children[0].name).toBe('2020')
      expect(tree[0].children[0].completed).toBe(true)
      expect(tree[0].children[0].fileCount).toBe(1)
    })
  })
})

describe('collectFileEntries', () => {
  describe('handle source', () => {
    it('collects file entries from discovered handle', async () => {
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

      const result = await collectFileEntries(
        { type: 'handle', handle, totalDirectories: 2, totalFiles: 2 },
        onFile,
        new AbortController().signal,
      )

      expect(result).toHaveLength(2)
      expect(result[0].path).toBe('photo.jpg')
      expect(result[1].path).toBe('sub/nested.png')
      expect(onFile).toHaveBeenCalledTimes(2)
    })
  })

  describe('fileList source', () => {
    it('collects file entries from discovered fileList', async () => {
      const files = createFileList([
        new File(['img1'], 'photo.jpg', { type: 'image/jpeg' }),
        new File(['doc'], 'readme.txt', { type: 'text/plain' }),
      ])

      Object.defineProperty(files[0], 'webkitRelativePath', { value: 'dir/photo.jpg' })
      Object.defineProperty(files[1], 'webkitRelativePath', { value: 'dir/readme.txt' })

      const onFile = vi.fn()

      const result = await collectFileEntries(
        { type: 'fileList', files, totalDirectories: 1, totalFiles: 1 },
        onFile,
        new AbortController().signal,
      )

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('dir/photo.jpg')
      expect(onFile).toHaveBeenCalledTimes(1)
    })
  })

  describe('yandex source', () => {
    it('returns cached entries with progress callbacks', async () => {
      const cachedEntries: FileEntry[] = [
        { path: '/photos/img1.jpg', name: 'img1.jpg', size: 1000 },
        { path: '/photos/img2.png', name: 'img2.png', size: 2000 },
      ]

      const onFile = vi.fn()

      const result = await collectFileEntries(
        { type: 'yandex', totalDirectories: 1, totalFiles: 2, cachedEntries },
        onFile,
        new AbortController().signal,
      )

      expect(result).toBe(cachedEntries)
      expect(result).toHaveLength(2)
      expect(onFile).toHaveBeenCalledTimes(2)
      expect(onFile).toHaveBeenCalledWith(cachedEntries[0])
      expect(onFile).toHaveBeenCalledWith(cachedEntries[1])
    })

    it('throws AbortError when signal is aborted', async () => {
      const cachedEntries: FileEntry[] = [
        { path: '/photos/img1.jpg', name: 'img1.jpg' },
      ]

      const controller = new AbortController()
      controller.abort()

      await expect(
        collectFileEntries(
          { type: 'yandex', totalDirectories: 1, totalFiles: 1, cachedEntries },
          vi.fn(),
          controller.signal,
        ),
      ).rejects.toThrow('Операция отменена')
    })
  })
})
