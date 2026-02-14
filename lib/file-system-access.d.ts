/**
 * Расширение типов для File System Access API
 * (showDirectoryPicker, FileSystemDirectoryHandle.values() и т.д.)
 */

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
  keys(): AsyncIterableIterator<string>
}

interface Window {
  showDirectoryPicker(options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle
  }): Promise<FileSystemDirectoryHandle>
}
