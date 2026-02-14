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
