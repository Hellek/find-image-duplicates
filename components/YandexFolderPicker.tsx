'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FolderOpen, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  listFolderContents,
  type YandexFolderResource,
} from '@/lib/yandexDisk'

interface YandexFolderPickerProps {
  token: string
  onScan: (folderPaths: string[]) => void
  onDisconnect: () => void
  disabled?: boolean
}

interface FolderNode {
  item: YandexFolderResource
  children: FolderNode[]
  loaded: boolean
  loading: boolean
}

function pathToName(path: string): string {
  const p = path.replace(/^disk:/, '').replace(/^\/+/, '')
  const parts = p.split('/')
  return parts[parts.length - 1] || 'Диск'
}

/** Проверяет, выбран ли какой-либо предок указанного пути */
export function isAncestorSelected(
  path: string,
  selectedPaths: Set<string>,
): boolean {
  for (const sel of selectedPaths) {
    if (path !== sel && path.startsWith(sel + '/')) {
      return true
    }
  }
  return false
}

export function YandexFolderPicker({
  token,
  onScan,
  onDisconnect,
  disabled,
}: YandexFolderPickerProps) {
  const [rootFolders, setRootFolders] = useState<FolderNode[]>([])
  const [rootLoading, setRootLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isScanning, setIsScanning] = useState(false)

  const loadRoot = useCallback(async () => {
    setRootLoading(true)

    try {
      const items = await listFolderContents(token, '/', undefined)
      const dirs = items.filter((i): i is YandexFolderResource => i.type === 'dir')
      setRootFolders(
        dirs.map(item => ({
          item,
          children: [],
          loaded: false,
          loading: false,
        })),
      )
    } catch (err) {
      console.error(err)
    } finally {
      setRootLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadRoot()
  }, [loadRoot])

  const loadChildren = async (node: FolderNode): Promise<FolderNode[]> => {
    const items = await listFolderContents(token, node.item.path, undefined)
    const dirs = items.filter((i): i is YandexFolderResource => i.type === 'dir')
    return dirs.map(item => ({
      item,
      children: [],
      loaded: false,
      loading: false,
    }))
  }

  const toggleExpand = async (path: string) => {
    const findAndLoad = async (
      nodes: FolderNode[],
      target: string,
    ): Promise<FolderNode[]> => {
      return Promise.all(
        nodes.map(async n => {
          if (n.item.path === target) {
            if (n.loaded) {
              return { ...n, loaded: false, children: [] }
            }

            const children = await loadChildren(n)
            return { ...n, children, loaded: true, loading: false }
          }
          return {
            ...n,
            children: await findAndLoad(n.children, target),
          }
        }),
      )
    }

    const setLoading = (
      nodes: FolderNode[],
      target: string,
      loading: boolean,
    ): FolderNode[] =>
      nodes.map(n =>
        n.item.path === target
          ? { ...n, loading }
          : { ...n, children: setLoading(n.children, target, loading) })

    setRootFolders(prev => setLoading(prev, path, true))

    const updated = await findAndLoad(rootFolders, path)
    setRootFolders(updated)
  }

  const toggleSelect = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)

        // Удаляем дочерние — они покрываются родителем
        for (const sel of prev) {
          if (sel.startsWith(path + '/')) {
            next.delete(sel)
          }
        }
      }
      return next
    })
  }

  const handleScan = () => {
    const paths = Array.from(selected)
    if (paths.length === 0) {
      onScan([])
    } else {
      onScan(paths)
    }

    setIsScanning(true)
  }

  const renderNode = (node: FolderNode, depth: number) => {
    const { item, children, loaded, loading } = node
    const name = pathToName(item.path)
    const hasChildren = loaded ? children.length > 0 : true
    const isExpanded = loaded

    return (
      <div key={item.path} className="flex flex-col">
        <div
          className="flex items-center gap-1 py-1 hover:bg-accent/50 rounded px-1 -mx-1"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            type="button"
            onClick={() => hasChildren && toggleExpand(item.path)}
            className="p-0.5 -m-0.5 shrink-0"
            aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : hasChildren ? (
              isExpanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )
            ) : (
              <span className="size-4 inline-block" />
            )}
          </button>
          <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
            <input
              type="checkbox"
              checked={
                selected.has(item.path)
                || isAncestorSelected(item.path, selected)
              }
              disabled={isAncestorSelected(item.path, selected)}
              onChange={() => toggleSelect(item.path)}
              className="rounded"
              title={
                isAncestorSelected(item.path, selected)
                  ? 'Включено через родительскую папку'
                  : undefined
              }
            />
            {isExpanded ? (
              <FolderOpen className="size-4 shrink-0 text-amber-500" />
            ) : (
              <Folder className="size-4 shrink-0 text-amber-500" />
            )}
            <span className="truncate text-sm">{name}</span>
          </label>
        </div>
        {isExpanded &&
          children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Выберите папки (рекурсивный поиск). Пустой выбор — сканирование всего Диска.
        </p>
        <Button variant="ghost" size="sm" onClick={onDisconnect}>
          Отключиться
        </Button>
      </div>

      <div className="border rounded-lg p-2 max-h-64 overflow-y-auto bg-muted/30">
        {rootLoading ? (
          <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Загрузка...
          </div>
        ) : rootFolders.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Папки не найдены
          </p>
        ) : (
          rootFolders.map(node => renderNode(node, 0))
        )}
      </div>

      <Button
        onClick={handleScan}
        disabled={disabled || isScanning}
        className="w-full"
      >
        {isScanning ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Запуск...
          </>
        ) : selected.size === 0 ? (
          'Сканировать весь Диск'
        ) : (
          `Сканировать (${selected.size} папок)`
        )}
      </Button>
    </div>
  )
}
