import { downloadFile, listImageFiles } from './yandexDisk'

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif',
])

function isImageFile(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

export interface FileEntry {
  path: string
  /** Для локальных файлов — всегда задан */
  file?: File
  /** Для удалённых (Яндекс.Диск) — ленивая загрузка. После вызова file кэшируется. */
  getFile?: () => Promise<File>
  /** URL папки (Яндекс.Диск) или undefined для локальных */
  directoryUrl?: string
  /** Размер файла в байтах (из метаданных API, без скачивания) */
  size?: number
  /** MD5-хэш файла (из метаданных API Яндекс.Диска) */
  md5?: string
  /** SHA-256 хэш файла (из метаданных API Яндекс.Диска, недокументированное поле) */
  sha256?: string
  /** Имя файла (из метаданных, для отображения без скачивания) */
  name?: string
}

/**
 * Возвращает File из записи. Для удалённых файлов вызывает getFile и кэширует результат.
 */
export async function getFileFromEntry(entry: FileEntry): Promise<File> {
  if (entry.file) return entry.file

  const file = await entry.getFile!()

  ;(entry as { file?: File }).file = file
  return file
}

/** Колбэк, вызываемый при обнаружении каждого файла изображения */
export type OnFileFound = (entry: FileEntry) => void

/** Узел дерева директорий для визуализации прогресса обнаружения */
export interface DirectoryTreeNode {
  /** Имя директории */
  name: string
  /** Полный путь */
  path: string
  /** Дочерние директории */
  children: DirectoryTreeNode[]
  /** Директория полностью просканирована (включая все поддиректории) */
  completed: boolean
  /** Количество файлов изображений непосредственно в этой директории */
  fileCount: number
}

/** Прогресс фазы обнаружения */
export interface DiscoveryProgress {
  /** Количество найденных директорий */
  directoriesFound: number
  /** Количество обнаруженных файлов изображений */
  filesFound: number
  /** Текущая сканируемая директория */
  currentDirectory: string
  /** Снимок дерева директорий (передаётся при изменении структуры дерева) */
  directoryTree?: DirectoryTreeNode[]
}

/** Колбэк прогресса обнаружения */
export type OnDiscoveryProgress = (info: DiscoveryProgress) => void

/** Результат фазы обнаружения */
export type DiscoveryResult =
  | {
    type: 'handle'
    handle: FileSystemDirectoryHandle
    totalDirectories: number
    totalFiles: number
  }
  | {
    type: 'fileList'
    files: FileList
    totalDirectories: number
    totalFiles: number
  }
  | {
    type: 'yandex'
    totalDirectories: number
    totalFiles: number
    cachedEntries: FileEntry[]
  }

/**
 * Рекурсивно обходит FileSystemDirectoryHandle, собирая файлы изображений.
 * Вызывает onFile для каждого найденного файла.
 */
async function scanDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  results: FileEntry[],
  onFile: OnFileFound,
  signal: AbortSignal,
  basePath: string = '',
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    if (signal.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name

    if (entry.kind === 'file') {
      if (isImageFile(entry.name)) {
        const file = await entry.getFile()
        const fileEntry: FileEntry = { path: entryPath, file }

        results.push(fileEntry)
        onFile(fileEntry)
      }
    } else if (entry.kind === 'directory') {
      await scanDirectoryHandle(entry, results, onFile, signal, entryPath)
    }
  }
}

/**
 * Собирает файлы изображений из FileList (от <input webkitdirectory>).
 * Вызывает onFile для каждого найденного файла.
 */
function collectFromFileList(
  files: FileList,
  results: FileEntry[],
  onFile: OnFileFound,
  signal: AbortSignal,
): void {
  for (let i = 0; i < files.length; i++) {
    if (signal.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const file = files[i]

    if (isImageFile(file.name)) {
      const fileEntry: FileEntry = {
        path: file.webkitRelativePath || file.name,
        file,
      }

      results.push(fileEntry)
      onFile(fileEntry)
    }
  }
}

export type DirectorySource =
  | { type: 'handle'; handle: FileSystemDirectoryHandle }
  | { type: 'fileList'; files: FileList }
  | { type: 'yandex'; token: string; folderPaths: string[] }

/**
 * Проверяет, поддерживается ли showDirectoryPicker в текущем браузере
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * Открывает диалог выбора директории через File System Access API.
 * Возвращает DirectorySource для дальнейшего сканирования.
 */
export async function pickDirectory(): Promise<DirectorySource> {
  const handle = await window.showDirectoryPicker({ mode: 'read' })
  return { type: 'handle', handle }
}

/**
 * Создаёт DirectorySource из FileList (от <input webkitdirectory>)
 */
export function fromFileList(files: FileList): DirectorySource {
  return { type: 'fileList', files }
}

/** URL веб-интерфейса Яндекс.Диска для папки */
export function getYandexDiskFolderUrl(folderPath: string): string {
  const clean = folderPath.replace(/^\/+/, '').replace(/^disk:/, '')
  const encoded = clean.split('/').map(encodeURIComponent).join('/')
  return `https://disk.yandex.ru/client/disk/${encoded || ''}`
}

/**
 * Рекурсивно обходит FileSystemDirectoryHandle, подсчитывая директории и файлы изображений.
 * Не читает содержимое файлов (не вызывает getFile).
 * Строит дерево директорий и отправляет снимок при входе/выходе из каждой директории.
 */
async function discoverFromHandle(
  handle: FileSystemDirectoryHandle,
  onProgress: OnDiscoveryProgress,
  signal: AbortSignal,
): Promise<DiscoveryResult & { type: 'handle' }> {
  let dirs = 0
  let files = 0

  const rootNode: DirectoryTreeNode = {
    name: handle.name,
    path: '',
    children: [],
    completed: false,
    fileCount: 0,
  }

  const nodeMap = new Map<string, DirectoryTreeNode>([['', rootNode]])

  function treeSnapshot(): DirectoryTreeNode[] {
    return structuredClone([rootNode])
  }

  async function walk(
    dirHandle: FileSystemDirectoryHandle,
    basePath: string,
  ): Promise<void> {
    dirs += 1

    const currentNode = nodeMap.get(basePath)!

    onProgress({
      directoriesFound: dirs,
      filesFound: files,
      currentDirectory: basePath || handle.name,
      directoryTree: treeSnapshot(),
    })

    for await (const entry of dirHandle.values()) {
      if (signal.aborted) {
        throw new DOMException('Операция отменена', 'AbortError')
      }

      if (entry.kind === 'file') {
        if (isImageFile(entry.name)) {
          files += 1
          currentNode.fileCount += 1
        }
      } else if (entry.kind === 'directory') {
        const entryPath = basePath
          ? `${basePath}/${entry.name}`
          : entry.name

        const childNode: DirectoryTreeNode = {
          name: entry.name,
          path: entryPath,
          children: [],
          completed: false,
          fileCount: 0,
        }

        currentNode.children.push(childNode)
        nodeMap.set(entryPath, childNode)

        await walk(entry, entryPath)
      }
    }

    // Директория полностью просканирована (включая все поддиректории)
    currentNode.completed = true

    onProgress({
      directoriesFound: dirs,
      filesFound: files,
      currentDirectory: basePath || handle.name,
      directoryTree: treeSnapshot(),
    })
  }

  await walk(handle, '')
  return { type: 'handle', handle, totalDirectories: dirs, totalFiles: files }
}

/**
 * Подсчитывает директории и файлы изображений из FileList.
 * Строит дерево директорий (всё мгновенно completed).
 * Операция мгновенная — данные уже в памяти.
 */
function discoverFromFileList(
  fileList: FileList,
  onProgress: OnDiscoveryProgress,
  signal: AbortSignal,
): DiscoveryResult & { type: 'fileList' } {
  const nodeMap = new Map<string, DirectoryTreeNode>()
  const rootNodes: DirectoryTreeNode[] = []
  let fileCount = 0

  for (let i = 0; i < fileList.length; i++) {
    if (signal.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    const file = fileList[i]
    if (!isImageFile(file.name)) continue

    fileCount += 1
    const relativePath = file.webkitRelativePath || file.name

    const dirPath = relativePath.includes('/')
      ? relativePath.slice(0, relativePath.lastIndexOf('/'))
      : ''

    if (dirPath) {
      // Создаём все промежуточные директории в дереве
      const parts = dirPath.split('/')
      let currentPath = ''

      for (const part of parts) {
        const parentPath = currentPath
        currentPath = currentPath ? `${currentPath}/${part}` : part

        if (!nodeMap.has(currentPath)) {
          const node: DirectoryTreeNode = {
            name: part,
            path: currentPath,
            children: [],
            completed: true, // FileList мгновенный — всё уже готово
            fileCount: 0,
          }

          nodeMap.set(currentPath, node)

          const parent = parentPath ? nodeMap.get(parentPath) : null

          if (parent) {
            parent.children.push(node)
          } else {
            rootNodes.push(node)
          }
        }
      }

      // Увеличиваем счётчик файлов в листовой директории
      const leafNode = nodeMap.get(dirPath)

      if (leafNode) leafNode.fileCount += 1
    }
  }

  onProgress({
    directoriesFound: nodeMap.size,
    filesFound: fileCount,
    currentDirectory: '',
    directoryTree: rootNodes,
  })

  return {
    type: 'fileList',
    files: fileList,
    totalDirectories: nodeMap.size,
    totalFiles: fileCount,
  }
}

/** Нормализует путь Яндекс.Диска: убирает префикс disk: */
function normalizeDiskPath(p: string): string {
  return p.replace(/^disk:/, '') || '/'
}

/**
 * Обнаруживает изображения на Яндекс.Диске: рекурсивно обходит папки,
 * подсчитывает директории и файлы, кэширует FileEntry для фазы сбора.
 * Строит дерево директорий с отслеживанием завершённости.
 */
async function discoverFromYandex(
  token: string,
  folderPaths: string[],
  onProgress: OnDiscoveryProgress,
  signal: AbortSignal,
): Promise<DiscoveryResult & { type: 'yandex' }> {
  let dirs = 0
  let files = 0
  const cachedEntries: FileEntry[] = []

  const nodeMap = new Map<string, DirectoryTreeNode>()
  const rootNodes: DirectoryTreeNode[] = []

  function treeSnapshot(): DirectoryTreeNode[] {
    return structuredClone(rootNodes)
  }

  /** Находит или создаёт родительский узел по пути */
  function ensureParentChain(normalizedPath: string): DirectoryTreeNode | null {
    const parentPath = normalizedPath.includes('/')
      ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))
      : ''

    return parentPath ? nodeMap.get(parentPath) ?? null : null
  }

  await listImageFiles(
    token,
    folderPaths,
    resource => {
      files += 1
      const path = resource.path.replace(/^disk:/, '') || `/${resource.name}`

      const dirPath = path.includes('/')
        ? path.slice(0, path.lastIndexOf('/'))
        : ''

      // Увеличиваем счётчик файлов в узле дерева
      const normalizedDir = dirPath || '/'
      const dirNode = nodeMap.get(normalizedDir)

      if (dirNode) dirNode.fileCount += 1

      cachedEntries.push({
        path,
        getFile: () => downloadFile(token, resource, signal),
        directoryUrl: dirPath
          ? getYandexDiskFolderUrl(dirPath)
          : undefined,
        size: resource.size,
        md5: resource.md5,
        sha256: resource.sha256,
        name: resource.name,
      })

      onProgress({
        directoriesFound: dirs,
        filesFound: files,
        currentDirectory: dirPath || '/',
      })
    },
    signal,
    folderPath => {
      dirs += 1
      const normalized = normalizeDiskPath(folderPath)

      // Пропускаем, если директория уже в дереве (перекрывающиеся папки)
      if (nodeMap.has(normalized)) {
        onProgress({
          directoriesFound: dirs,
          filesFound: files,
          currentDirectory: folderPath,
        })
        return
      }

      const name = normalized.split('/').pop() || normalized

      const node: DirectoryTreeNode = {
        name,
        path: normalized,
        children: [],
        completed: false,
        fileCount: 0,
      }

      nodeMap.set(normalized, node)

      const parent = ensureParentChain(normalized)

      if (parent) {
        parent.children.push(node)
      } else {
        rootNodes.push(node)
      }

      onProgress({
        directoriesFound: dirs,
        filesFound: files,
        currentDirectory: folderPath,
        directoryTree: treeSnapshot(),
      })
    },
    folderPath => {
      const normalized = normalizeDiskPath(folderPath)
      const node = nodeMap.get(normalized)

      if (node) node.completed = true

      onProgress({
        directoriesFound: dirs,
        filesFound: files,
        currentDirectory: folderPath,
        directoryTree: treeSnapshot(),
      })
    },
  )

  return {
    type: 'yandex',
    totalDirectories: dirs,
    totalFiles: files,
    cachedEntries,
  }
}

/**
 * Фаза 1: рекурсивное обнаружение субдиректорий и подсчёт файлов изображений.
 * Для локальных источников — не читает содержимое файлов.
 * Для Яндекс.Диска — кэширует метаданные файлов (без скачивания).
 */
export async function discoverFiles(
  source: DirectorySource,
  onProgress: OnDiscoveryProgress,
  signal: AbortSignal,
): Promise<DiscoveryResult> {
  if (source.type === 'handle') {
    return discoverFromHandle(source.handle, onProgress, signal)
  }
  if (source.type === 'fileList') {
    return discoverFromFileList(source.files, onProgress, signal)
  }
  return discoverFromYandex(
    source.token,
    source.folderPaths,
    onProgress,
    signal,
  )
}

/**
 * Фаза 2: получение данных файлов на основе результатов обнаружения.
 * Для локальных файлов — читает содержимое (getFile).
 * Для Яндекс.Диска — возвращает кэшированные записи (без дополнительных запросов).
 */
export async function collectFileEntries(
  discovery: DiscoveryResult,
  onFile: OnFileFound,
  signal: AbortSignal,
): Promise<FileEntry[]> {
  if (discovery.type === 'handle') {
    const results: FileEntry[] = []
    await scanDirectoryHandle(
      discovery.handle,
      results,
      onFile,
      signal,
    )
    return results
  }

  if (discovery.type === 'fileList') {
    const results: FileEntry[] = []
    collectFromFileList(discovery.files, results, onFile, signal)
    return results
  }

  // Яндекс.Диск: данные уже получены при обнаружении, отдаём с прогрессом
  for (const entry of discovery.cachedEntries) {
    if (signal.aborted) {
      throw new DOMException('Операция отменена', 'AbortError')
    }

    onFile(entry)
  }
  return discovery.cachedEntries
}

/**
 * Сканирует изображения на Яндекс.Диске и возвращает FileEntry[] с ленивой загрузкой.
 * folderPaths — пути папок для сканирования (пустой = весь Диск).
 */
async function scanYandexDisk(
  token: string,
  folderPaths: string[],
  results: FileEntry[],
  onFile: OnFileFound,
  signal: AbortSignal,
): Promise<void> {
  await listImageFiles(
    token,
    folderPaths,
    resource => {
      const path = resource.path.replace(/^disk:/, '') || `/${resource.name}`
      const dirPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

      const entry: FileEntry = {
        path,
        getFile: () => downloadFile(token, resource, signal),
        directoryUrl: dirPath ? getYandexDiskFolderUrl(dirPath) : undefined,
        size: resource.size,
        md5: resource.md5,
        sha256: resource.sha256,
        name: resource.name,
      }

      results.push(entry)
      onFile(entry)
    },
    signal,
  )
}

/**
 * Рекурсивно сканирует директорию и возвращает массив найденных файлов изображений.
 * Вызывает onFile при обнаружении каждого файла для обновления прогресса.
 */
export async function scanDirectory(
  source: DirectorySource,
  onFile: OnFileFound,
  signal: AbortSignal,
): Promise<FileEntry[]> {
  const results: FileEntry[] = []

  if (source.type === 'handle') {
    await scanDirectoryHandle(source.handle, results, onFile, signal)
  } else if (source.type === 'fileList') {
    collectFromFileList(source.files, results, onFile, signal)
  } else {
    await scanYandexDisk(source.token, source.folderPaths, results, onFile, signal)
  }

  return results
}
