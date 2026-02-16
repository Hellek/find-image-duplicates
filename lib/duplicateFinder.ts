import type { FileEntry } from '@/lib/fileSystem'
import { getFileFromEntry } from '@/lib/fileSystem'
import { computeCryptoHash, computePerceptualHash, hammingDistance } from '@/lib/imageHash'

export interface HashedFile {
  entry: FileEntry
  hash: string
  /** Файл, использованный для хэширования (для превью и размера) */
  file: File
  /** Object URL для превью (создаётся лениво) */
  previewUrl?: string
}

export interface DuplicateGroup {
  /** Хэш группы (для точных — SHA-256/MD5, для похожих — хэш первого файла) */
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
  phase: 'discovering' | 'scanning' | 'hashing' | 'comparing'
  /** Ориентировочное оставшееся время в миллисекундах */
  estimatedRemainingMs?: number
  /** Скорость скачивания в байт/сек (только при загрузке удалённых файлов) */
  downloadSpeed?: number
  /** Количество найденных директорий (фаза discovering) */
  directoriesFound?: number
}

/** Сколько файлов обрабатывать перед yield на UI поток */
const BATCH_SIZE = 5

/** Минимум обработанных файлов, после которого ETA становится осмысленным */
const MIN_FILES_FOR_ETA = 3

/**
 * Трекер прогресса: отслеживает время и объём скачанных данных
 * для вычисления ETA и скорости загрузки.
 *
 * @param trackSpeed — если true, отслеживает скорость скачивания (для удалённых файлов).
 *   Для локальных файлов скорость не имеет смысла — передавать false.
 */
class ProgressTracker {
  private readonly startTime: number
  private readonly trackSpeed: boolean
  private bytesDownloaded = 0

  constructor(trackSpeed = false) {
    this.startTime = performance.now()
    this.trackSpeed = trackSpeed
  }

  /** Регистрирует обработанный файл (по размеру). Учитывается для скорости только если trackSpeed = true. */
  addBytes(bytes: number): void {
    if (this.trackSpeed) {
      this.bytesDownloaded += bytes
    }
  }

  /** Вычисляет ETA и скорость для текущего прогресса */
  getEstimates(processedFiles: number, totalFiles: number): Pick<ScanProgress, 'estimatedRemainingMs' | 'downloadSpeed'> {
    if (processedFiles < MIN_FILES_FOR_ETA) {
      return {}
    }

    const elapsedMs = performance.now() - this.startTime
    const remaining = totalFiles - processedFiles
    const msPerFile = elapsedMs / processedFiles
    const estimatedRemainingMs = Math.round(msPerFile * remaining)

    const result: Pick<ScanProgress, 'estimatedRemainingMs' | 'downloadSpeed'> = { estimatedRemainingMs }

    if (this.bytesDownloaded > 0) {
      result.downloadSpeed = Math.round(this.bytesDownloaded / (elapsedMs / 1000))
    }

    return result
  }
}

/**
 * Определяет, какой хэш из метаданных доступен у всех файлов.
 * Предпочитает sha256 (совпадает с вычисляемым), затем md5 (документированный).
 * Возвращает null, если не у всех файлов есть хэш.
 */
function getMetadataHashKey(files: FileEntry[]): 'sha256' | 'md5' | null {
  if (files.length === 0) return null
  if (files.every(f => f.sha256)) return 'sha256'
  if (files.every(f => f.md5)) return 'md5'
  return null
}

/**
 * Быстрый путь: группировка точных дубликатов по хэшу из метаданных API.
 * Не скачивает файлы для вычисления хэша — использует md5/sha256 из ответа Яндекс.Диска.
 * Скачивает только файлы из дубликатных групп (для отображения превью в UI).
 */
async function findExactDuplicatesByMetadata(
  files: FileEntry[],
  hashKey: 'sha256' | 'md5',
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<DuplicateGroup[]> {
  // Фаза 1: мгновенная группировка по хэшу из метаданных
  const hashMap = new Map<string, FileEntry[]>()

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const entry = files[i]
    const hash = entry[hashKey]!

    onProgress({
      totalFiles: files.length,
      processedFiles: i + 1,
      currentFile: entry.path,
      phase: 'hashing',
    })

    const group = hashMap.get(hash)
    if (group) {
      group.push(entry)
    } else {
      hashMap.set(hash, [entry])
    }
  }

  // Фаза 2: отбираем только группы с 2+ файлами (дубликаты)
  const duplicateEntries: [string, FileEntry[]][] = []
  for (const [hash, entries] of hashMap) {
    if (entries.length > 1) {
      duplicateEntries.push([hash, entries])
    }
  }

  // Фаза 3: скачиваем файлы только из дубликатных групп (для превью в UI)
  const totalDuplicateFiles = duplicateEntries.reduce((sum, [, entries]) => sum + entries.length, 0)
  let downloadedCount = 0
  const tracker = new ProgressTracker(true)

  const groups: DuplicateGroup[] = []

  for (const [hash, entries] of duplicateEntries) {
    const hashedFiles: HashedFile[] = []

    for (const entry of entries) {
      if (signal?.aborted) {
        throw new DOMException('Операция отменена', 'AbortError')
      }

      onProgress({
        totalFiles: totalDuplicateFiles,
        processedFiles: downloadedCount,
        currentFile: entry.path,
        phase: 'comparing',
        ...tracker.getEstimates(downloadedCount, totalDuplicateFiles),
      })

      const file = await getFileFromEntry(entry)
      tracker.addBytes(file.size)
      hashedFiles.push({ entry, hash, file })
      downloadedCount += 1

      if (downloadedCount % BATCH_SIZE === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
    }

    groups.push({ hash, files: hashedFiles })
  }

  return groups
}

/**
 * Ищет точные дубликаты.
 * Быстрый путь: если у всех файлов есть хэш из метаданных (Яндекс.Диск) —
 * группирует по md5/sha256 без скачивания. Скачивает только дубликаты для превью.
 * Fallback: скачивает все файлы и вычисляет SHA-256 (для локальных файлов или при отсутствии метаданных).
 */
export async function findExactDuplicates(
  files: FileEntry[],
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<DuplicateGroup[]> {
  // Быстрый путь: хэши из метаданных API (без скачивания)
  const hashKey = getMetadataHashKey(files)
  if (hashKey) {
    console.log(`[duplicateFinder] Быстрый путь: группировка по ${hashKey} из метаданных (${files.length} файлов)`)
    return findExactDuplicatesByMetadata(files, hashKey, onProgress, signal)
  }

  // Fallback: скачивание и вычисление SHA-256
  const hashMap = new Map<string, HashedFile[]>()
  const isRemote = files.length > 0 && !files[0].file
  const tracker = new ProgressTracker(isRemote)

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
      ...tracker.getEstimates(i, files.length),
    })

    const file = await getFileFromEntry(entry)
    tracker.addBytes(file.size)
    const hash = await computeCryptoHash(file)
    const hashedFile: HashedFile = { entry, hash, file }

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
 *
 * Оптимизация: если у файлов есть md5 из метаданных — побайтовые копии группируются,
 * и перцептивный хэш вычисляется только для одного представителя каждой md5-группы.
 */
export async function findSimilarDuplicates(
  files: FileEntry[],
  threshold: number,
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal,
): Promise<DuplicateGroup[]> {
  // Фаза 1: вычисляем перцептивные хэши
  // Оптимизация: если есть md5 — скачиваем и хэшируем только уникальные файлы
  const hasMetadata = files.length > 0 && files.every(f => f.md5)
  const hashedFiles: HashedFile[] = []

  if (hasMetadata) {
    // Группируем по md5 — побайтовые копии получат одинаковый перцептивный хэш
    const md5Groups = new Map<string, FileEntry[]>()
    for (const entry of files) {
      const group = md5Groups.get(entry.md5!)
      if (group) {
        group.push(entry)
      } else {
        md5Groups.set(entry.md5!, [entry])
      }
    }

    const uniqueCount = md5Groups.size
    let processedUnique = 0
    const tracker = new ProgressTracker(true)

    for (const entries of md5Groups.values()) {
      if (signal?.aborted) {
        throw new DOMException('Операция отменена', 'AbortError')
      }

      const representative = entries[0]

      onProgress({
        totalFiles: uniqueCount,
        processedFiles: processedUnique,
        currentFile: representative.path,
        phase: 'hashing',
        ...tracker.getEstimates(processedUnique, uniqueCount),
      })

      try {
        const file = await getFileFromEntry(representative)
        tracker.addBytes(file.size)
        const hash = await computePerceptualHash(file)

        // Представитель уже скачан
        hashedFiles.push({ entry: representative, hash, file })

        // Остальные файлы в md5-группе получают тот же перцептивный хэш
        for (let i = 1; i < entries.length; i++) {
          const dupeFile = await getFileFromEntry(entries[i])
          tracker.addBytes(dupeFile.size)
          hashedFiles.push({ entry: entries[i], hash, file: dupeFile })
        }
      } catch {
        console.warn(`Не удалось обработать: ${representative.path}`)
      }

      processedUnique += 1

      if (processedUnique % BATCH_SIZE === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
    }

    console.log(
      `[duplicateFinder] Похожие: ${files.length} файлов, ${uniqueCount} уникальных по md5 → хэшировано ${uniqueCount}`,
    )
  } else {
    // Fallback: нет метаданных — хэшируем все файлы
    const isRemote = files.length > 0 && !files[0].file
    const tracker = new ProgressTracker(isRemote)

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
        ...tracker.getEstimates(i, files.length),
      })

      try {
        const file = await getFileFromEntry(entry)
        tracker.addBytes(file.size)
        const hash = await computePerceptualHash(file)
        hashedFiles.push({ entry, hash, file })
      } catch {
        // Пропускаем файлы, которые не удалось декодировать
        console.warn(`Не удалось обработать: ${entry.path}`)
      }

      if (i % BATCH_SIZE === 0) {
        await new Promise(r => setTimeout(r, 0))
      }
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

/**
 * Форматирует оставшееся время в человекочитаемый вид.
 * Возвращает null если значение не задано или ≤ 0.
 */
export function formatEta(ms: number | undefined): string | null {
  if (ms == null || ms <= 0) return null

  const totalSeconds = Math.ceil(ms / 1000)

  if (totalSeconds < 60) {
    return `≈ ${totalSeconds} сек`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (seconds === 0) {
    return `≈ ${minutes} мин`
  }

  return `≈ ${minutes} мин ${seconds} сек`
}

/**
 * Форматирует скорость скачивания в человекочитаемый вид.
 * Возвращает null если значение не задано или ≤ 0.
 */
export function formatSpeed(bytesPerSec: number | undefined): string | null {
  if (bytesPerSec == null || bytesPerSec <= 0) return null

  if (bytesPerSec < 1024) return `${bytesPerSec} B/с`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/с`
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/с`
}
