import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { computeCryptoHash, computePerceptualHash, hammingDistance } from '../imageHash'

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance('abcdef', 'abcdef')).toBe(0)
  })

  it('counts differing bits correctly', () => {
    // '0' = 0000, '1' = 0001 → 1 бит различается
    expect(hammingDistance('0', '1')).toBe(1)
  })

  it('handles completely different hex digits', () => {
    // '0' = 0000, 'f' = 1111 → 4 бита различаются
    expect(hammingDistance('0', 'f')).toBe(4)
  })

  it('sums distance across multiple characters', () => {
    // '00' vs 'ff' → 4 + 4 = 8
    expect(hammingDistance('00', 'ff')).toBe(8)
  })

  it('throws on different length hashes', () => {
    expect(() => hammingDistance('abc', 'ab')).toThrow('Хэши имеют разную длину')
  })

  it('returns 0 for empty strings', () => {
    expect(hammingDistance('', '')).toBe(0)
  })

  it('handles partial difference', () => {
    // 'a' = 1010, 'b' = 1011 → 1 бит
    expect(hammingDistance('a', 'b')).toBe(1)
  })
})

describe('computeCryptoHash', () => {
  beforeEach(() => {
    // В jsdom crypto.subtle может работать через Node.js crypto
    // Мокаем его для надёжности
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async (_algo: string, buffer: ArrayBuffer) => {
          // Простая детерминированная хэш-функция для тестов
          const view = new Uint8Array(buffer)
          const result = new Uint8Array(32) // SHA-256 = 32 байта
          for (let i = 0; i < view.length; i++) {
            result[i % 32] ^= view[i]
          }
          return result.buffer
        }),
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a 64-character hex string (SHA-256)', async () => {
    const blob = new Blob(['hello world'])
    const file = new File([blob], 'test.jpg', { type: 'image/jpeg' })

    const hash = await computeCryptoHash(file)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns the same hash for the same content', async () => {
    const content = 'identical content'
    const file1 = new File([new Blob([content])], 'a.jpg', { type: 'image/jpeg' })
    const file2 = new File([new Blob([content])], 'b.jpg', { type: 'image/jpeg' })

    const hash1 = await computeCryptoHash(file1)
    const hash2 = await computeCryptoHash(file2)

    expect(hash1).toBe(hash2)
  })

  it('returns different hashes for different content', async () => {
    const file1 = new File([new Blob(['content A'])], 'a.jpg', { type: 'image/jpeg' })
    const file2 = new File([new Blob(['content B'])], 'b.jpg', { type: 'image/jpeg' })

    const hash1 = await computeCryptoHash(file1)
    const hash2 = await computeCryptoHash(file2)

    expect(hash1).not.toBe(hash2)
  })
})

describe('computePerceptualHash', () => {
  const mockImageData = {
    data: new Uint8ClampedArray(100 * 100 * 4),
    width: 100,
    height: 100,
    colorSpace: 'srgb' as PredefinedColorSpace,
  }

  const mockCtx = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => mockImageData),
  }

  const mockBitmap = {
    width: 100,
    height: 100,
    close: vi.fn(),
  }

  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap))

    // OffscreenCanvas нужен как конструктор (new OffscreenCanvas(...))
    class MockOffscreenCanvas {
      width: number
      height: number

      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }

      getContext() {
        return mockCtx
      }
    }
    vi.stubGlobal('OffscreenCanvas', MockOffscreenCanvas)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('calls createImageBitmap with the file', async () => {
    const file = new File([new Blob(['data'])], 'test.png', { type: 'image/png' })
    await computePerceptualHash(file)

    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(file)
  })

  it('closes bitmap after use', async () => {
    const file = new File([new Blob(['data'])], 'test.png', { type: 'image/png' })
    await computePerceptualHash(file)

    expect(mockBitmap.close).toHaveBeenCalled()
  })

  it('returns a hex string', async () => {
    const file = new File([new Blob(['data'])], 'test.png', { type: 'image/png' })
    const hash = await computePerceptualHash(file)

    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('throws if 2d context is unavailable', async () => {
    class NullCtxOffscreenCanvas {
      width: number
      height: number

      constructor(w: number, h: number) {
        this.width = w
        this.height = h
      }

      getContext() {
        return null
      }
    }
    vi.stubGlobal('OffscreenCanvas', NullCtxOffscreenCanvas)

    const file = new File([new Blob(['data'])], 'test.png', { type: 'image/png' })
    await expect(computePerceptualHash(file)).rejects.toThrow(
      'Не удалось создать 2D контекст OffscreenCanvas',
    )
  })
})
