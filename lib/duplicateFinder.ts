import type { FileEntry } from '@/lib/fileSystem'
import { computeCryptoHash, computePerceptualHash, hammingDistance } from '@/lib/imageHash'

export interface HashedFile {
  entry: FileEntry
  hash: string
  /** Object URL для превью (создаётся лениво) */
  previewUrl?: string
}

export interface DuplicateGroup {
  /** Хэш группы (для точных — SHA-256, для похожих — хэш первого файла) */
  hash: string
  files: HashedFile[]
}

export interface ScanProgress {
  /** Общее количество найденных файлов */
  totalFiles: number
  /** Количество обработанных файлов */
  processedFiles: number
  /** Путь текущего обрабатываемого файла */
  currentFile: string
  /** Текущая фаза */
  phase: 'scanning' | 'hashing' | 'comparing'
}

/** Сколько файлов обрабатывать перед yield на UI поток */
const BATCH_SIZE = 5

/**
 * Ищет точные дубликаты по SHA-256.
 * Async-генератор: yield-ит прогресс на каждом шаге.
 * По завершению возвращает массив групп дубликатов через callback.
 */
export async function findExactDuplicates(
  files: FileEntry[],
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<DuplicateGroup[]> {
  const hashMap = new Map<string, HashedFile[]>()

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const entry = files[i]

    onProgress({
      totalFiles: files.length,
      processedFiles: i,
      currentFile: entry.path,
      phase: 'hashing',
    })

    const hash = await computeCryptoHash(entry.file)
    const hashedFile: HashedFile = { entry, hash }

    const group = hashMap.get(hash)
    if (group) {
      group.push(hashedFile)
    } else {
      hashMap.set(hash, [hashedFile])
    }

    // Отдаём управление UI-потоку каждые BATCH_SIZE файлов
    if (i % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, 0))
    }
  }

  onProgress({
    totalFiles: files.length,
    processedFiles: files.length,
    currentFile: '',
    phase: 'comparing',
  })

  // Фильтруем: оставляем только группы с 2+ файлами (дубликаты)
  const groups: DuplicateGroup[] = []
  for (const [hash, groupFiles] of hashMap) {
    if (groupFiles.length > 1) {
      groups.push({ hash, files: groupFiles })
    }
  }

  return groups
}

/**
 * Ищет визуально похожие дубликаты по перцептивному хэшу.
 * threshold — максимальное расстояние Хэмминга для считания файлов похожими.
 */
export async function findSimilarDuplicates(
  files: FileEntry[],
  threshold: number,
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<DuplicateGroup[]> {
  // Фаза 1: вычисляем перцептивные хэши
  const hashedFiles: HashedFile[] = []

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const entry = files[i]

    onProgress({
      totalFiles: files.length,
      processedFiles: i,
      currentFile: entry.path,
      phase: 'hashing',
    })

    try {
      const hash = await computePerceptualHash(entry.file)
      hashedFiles.push({ entry, hash })
    } catch {
      // Пропускаем файлы, которые не удалось декодировать
      console.warn(`Не удалось обработать: ${entry.path}`)
    }

    if (i % BATCH_SIZE === 0) {
      await new Promise(r => setTimeout(r, 0))
    }
  }

  // Фаза 2: группировка по схожести (Union-Find)
  onProgress({
    totalFiles: files.length,
    processedFiles: files.length,
    currentFile: '',
    phase: 'comparing',
  })

  const n = hashedFiles.length
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]] // path compression
      x = parent[x]
    }
    return x
  }

  function union(a: number, b: number) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) {
      parent[ra] = rb
    }
  }

  // Сравниваем все пары
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (signal?.aborted) {
        throw new DOMException('Операция отменена', 'AbortError')
      }

      const dist = hammingDistance(hashedFiles[i].hash, hashedFiles[j].hash)
      if (dist <= threshold) {
        union(i, j)
      }
    }

    // Периодически отдаём UI поток
    if (i % 50 === 0) {
      await new Promise(r => setTimeout(r, 0))
    }
  }

  // Собираем группы
  const groupMap = new Map<number, HashedFile[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const group = groupMap.get(root)
    if (group) {
      group.push(hashedFiles[i])
    } else {
      groupMap.set(root, [hashedFiles[i]])
    }
  }

  const groups: DuplicateGroup[] = []
  for (const groupFiles of groupMap.values()) {
    if (groupFiles.length > 1) {
      groups.push({
        hash: groupFiles[0].hash,
        files: groupFiles,
      })
    }
  }

  return groups
}

/**
 * Создаёт Object URL для превью файла. Нужно вызвать URL.revokeObjectURL после использования.
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file)
}

/**
 * Форматирует размер файла в человекочитаемый вид
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
