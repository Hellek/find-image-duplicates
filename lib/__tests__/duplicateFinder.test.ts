import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPreviewUrl,
  findExactDuplicates,
  findSimilarDuplicates,
  formatFileSize,
} from '../duplicateFinder'
import type { FileEntry } from '../fileSystem'

// Мокаем зависимости
vi.mock('../fileSystem', () => ({
  getFileFromEntry: vi.fn((entry: FileEntry) => Promise.resolve(
    entry.file ?? new File(['mock'], 'mock.jpg'),
  )),
}))

vi.mock('../imageHash', () => ({
  computeCryptoHash: vi.fn(),
  computePerceptualHash: vi.fn(),
  hammingDistance: vi.fn(),
}))

// Импортируем моки после vi.mock
const { computeCryptoHash } = await import('../imageHash')
const { computePerceptualHash } = await import('../imageHash')
const { hammingDistance } = await import('../imageHash')

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1023)).toBe('1023.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(1024 * 1024 * 5.5)).toBe('5.5 MB')
    expect(formatFileSize(1024 * 1024 * 100)).toBe('100.0 MB')
  })
})

describe('createPreviewUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn(() => 'blob:http://localhost/mock-url'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls URL.createObjectURL with the file', () => {
    const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' })
    const url = createPreviewUrl(file)

    expect(URL.createObjectURL).toHaveBeenCalledWith(file)
    expect(url).toBe('blob:http://localhost/mock-url')
  })
})

describe('findExactDuplicates', () => {
  const mockComputeCryptoHash = vi.mocked(computeCryptoHash)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeEntry(path: string, content: string = 'data'): FileEntry {
    return { path, file: new File([content], path.split('/').pop()!) }
  }

  it('groups files with identical hashes', async () => {
    const entries = [
      makeEntry('a.jpg', 'same'),
      makeEntry('b.jpg', 'same'),
      makeEntry('c.jpg', 'different'),
    ]

    mockComputeCryptoHash
      .mockResolvedValueOnce('hash-A')
      .mockResolvedValueOnce('hash-A')
      .mockResolvedValueOnce('hash-B')

    const onProgress = vi.fn()
    const groups = await findExactDuplicates(entries, onProgress)

    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(2)
    expect(groups[0].hash).toBe('hash-A')
  })

  it('returns empty array when no duplicates found', async () => {
    const entries = [
      makeEntry('a.jpg'),
      makeEntry('b.jpg'),
    ]

    mockComputeCryptoHash
      .mockResolvedValueOnce('hash-1')
      .mockResolvedValueOnce('hash-2')

    const groups = await findExactDuplicates(entries, vi.fn())
    expect(groups).toHaveLength(0)
  })

  it('calls onProgress for each file', async () => {
    const entries = [makeEntry('a.jpg'), makeEntry('b.jpg')]
    mockComputeCryptoHash.mockResolvedValue('hash-unique')

    const onProgress = vi.fn()
    await findExactDuplicates(entries, onProgress)

    // Вызов на каждый файл + финальный
    expect(onProgress).toHaveBeenCalledTimes(3)

    // Проверяем первый вызов
    expect(onProgress).toHaveBeenCalledWith({
      totalFiles: 2,
      processedFiles: 0,
      currentFile: 'a.jpg',
      phase: 'hashing',
    })

    // Финальный вызов с фазой comparing
    expect(onProgress).toHaveBeenLastCalledWith({
      totalFiles: 2,
      processedFiles: 2,
      currentFile: '',
      phase: 'comparing',
    })
  })

  it('throws AbortError when aborted', async () => {
    const entries = [makeEntry('a.jpg')]
    mockComputeCryptoHash.mockResolvedValue('hash')

    const controller = new AbortController()
    controller.abort()

    await expect(
      findExactDuplicates(entries, vi.fn(), controller.signal),
    ).rejects.toThrow('Операция отменена')
  })

  it('handles multiple duplicate groups', async () => {
    const entries = [
      makeEntry('a1.jpg'),
      makeEntry('a2.jpg'),
      makeEntry('b1.jpg'),
      makeEntry('b2.jpg'),
    ]

    mockComputeCryptoHash
      .mockResolvedValueOnce('group-A')
      .mockResolvedValueOnce('group-A')
      .mockResolvedValueOnce('group-B')
      .mockResolvedValueOnce('group-B')

    const groups = await findExactDuplicates(entries, vi.fn())
    expect(groups).toHaveLength(2)
  })
})

describe('findSimilarDuplicates', () => {
  const mockComputePerceptualHash = vi.mocked(computePerceptualHash)
  const mockHammingDistance = vi.mocked(hammingDistance)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeEntry(path: string, content: string = 'data'): FileEntry {
    return { path, file: new File([content], path.split('/').pop()!) }
  }

  it('groups similar images within threshold', async () => {
    const entries = [
      makeEntry('a.jpg'),
      makeEntry('b.jpg'),
      makeEntry('c.jpg'),
    ]

    mockComputePerceptualHash
      .mockResolvedValueOnce('hash-a')
      .mockResolvedValueOnce('hash-b')
      .mockResolvedValueOnce('hash-c')

    // a-b: distance 5 (within threshold 10)
    // a-c: distance 20 (outside threshold)
    // b-c: distance 20 (outside threshold)
    mockHammingDistance
      .mockReturnValueOnce(5) // a vs b
      .mockReturnValueOnce(20) // a vs c
      .mockReturnValueOnce(20) // b vs c

    const groups = await findSimilarDuplicates(entries, 10, vi.fn())

    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(2)
  })

  it('returns empty array when all images are different', async () => {
    const entries = [makeEntry('a.jpg'), makeEntry('b.jpg')]

    mockComputePerceptualHash
      .mockResolvedValueOnce('hash-a')
      .mockResolvedValueOnce('hash-b')

    mockHammingDistance.mockReturnValue(100)

    const groups = await findSimilarDuplicates(entries, 10, vi.fn())
    expect(groups).toHaveLength(0)
  })

  it('skips files that fail to decode', async () => {
    const entries = [
      makeEntry('good.jpg'),
      makeEntry('bad.jpg'),
      makeEntry('good2.jpg'),
    ]

    mockComputePerceptualHash
      .mockResolvedValueOnce('hash-1')
      .mockRejectedValueOnce(new Error('decode error'))
      .mockResolvedValueOnce('hash-1')

    mockHammingDistance.mockReturnValue(0)

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const groups = await findSimilarDuplicates(entries, 10, vi.fn())

    expect(consoleWarn).toHaveBeenCalledWith('Не удалось обработать: bad.jpg')
    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(2)

    consoleWarn.mockRestore()
  })

  it('throws AbortError when aborted', async () => {
    const entries = [makeEntry('a.jpg')]
    const controller = new AbortController()
    controller.abort()

    await expect(
      findSimilarDuplicates(entries, 10, vi.fn(), controller.signal),
    ).rejects.toThrow('Операция отменена')
  })

  it('uses Union-Find to transitively group files', async () => {
    // a похож на b, b похож на c → все трое в одной группе
    const entries = [
      makeEntry('a.jpg'),
      makeEntry('b.jpg'),
      makeEntry('c.jpg'),
    ]

    mockComputePerceptualHash
      .mockResolvedValueOnce('hash-a')
      .mockResolvedValueOnce('hash-b')
      .mockResolvedValueOnce('hash-c')

    mockHammingDistance
      .mockReturnValueOnce(3) // a vs b — похожи
      .mockReturnValueOnce(20) // a vs c — не похожи
      .mockReturnValueOnce(3) // b vs c — похожи

    const groups = await findSimilarDuplicates(entries, 10, vi.fn())

    expect(groups).toHaveLength(1)
    expect(groups[0].files).toHaveLength(3)
  })
})
