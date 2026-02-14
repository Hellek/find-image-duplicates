import { bmvbhash } from 'blockhash-core'

/**
 * Вычисляет SHA-256 хэш по сырым байтам файла.
 * Быстрый, не требует декодирования изображения.
 * Находит только побайтовые (точные) копии.
 */
export async function computeCryptoHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = new Uint8Array(hashBuffer)
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Размер хэша blockhash в битах (bits * bits). При bits=16 получаем 256-битный хэш */
const BLOCKHASH_BITS = 16

/**
 * Вычисляет перцептивный хэш изображения через blockhash-core.
 * Требует декодирования изображения через Canvas.
 * Находит визуально похожие изображения.
 */
export async function computePerceptualHash(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Не удалось создать 2D контекст OffscreenCanvas')
  }

  ctx.drawImage(bitmap, 0, 0)
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  bitmap.close()

  return bmvbhash(imageData, BLOCKHASH_BITS)
}

/**
 * Вычисляет расстояние Хэмминга между двумя hex-строками хэшей.
 * Возвращает количество различающихся бит.
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error(`Хэши имеют разную длину: ${hash1.length} vs ${hash2.length}`)
  }

  let distance = 0

  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)
    // Подсчитываем количество установленных бит в xor (popcount для 4-битного числа)
    distance += ((xor >> 0) & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1)
  }

  return distance
}
