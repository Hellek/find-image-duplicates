'use client'

import { useEffect, useRef } from 'react'
import { Check, Folder, FolderOpen, Loader2 } from 'lucide-react'

import type { DirectoryTreeNode } from '@/lib/fileSystem'
import { cn } from '@/lib/utils'

interface DirectoryTreeProps {
  nodes: DirectoryTreeNode[]
}

export function DirectoryTree({ nodes }: DirectoryTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Автоскролл к последнему изменению
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Скроллим вниз только если пользователь и так был внизу (±30px)
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30

    if (isNearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [nodes])

  if (nodes.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="max-h-52 overflow-y-auto rounded-md border bg-muted/30 p-3"
    >
      <ul className="space-y-0">
        {nodes.map(node => (
          <TreeNode key={node.path || '__root__'} node={node} depth={0} />
        ))}
      </ul>
    </div>
  )
}

function TreeNode({ node, depth }: { node: DirectoryTreeNode; depth: number }) {
  const isLeaf = node.children.length === 0

  return (
    <li>
      <div
        className={cn(
          'flex items-center gap-1.5 py-0.5 text-xs',
          node.completed
            ? 'text-green-600 dark:text-green-400'
            : 'text-foreground',
        )}
        style={depth > 0 ? { paddingLeft: `${depth * 16}px` } : undefined}
      >
        {node.completed
          ? (
            <Check className="size-3.5 shrink-0" />
          )
          : isLeaf
            ? (
              <Folder className="size-3.5 shrink-0" />
            )
            : (
              <FolderOpen className="size-3.5 shrink-0" />
            )}

        <span className="truncate">{node.name}</span>

        {node.fileCount > 0 && (
          <span className="shrink-0 text-muted-foreground">
            (
            {node.fileCount}
            )
          </span>
        )}

        {!node.completed && !isLeaf && (
          <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />
        )}
      </div>

      {node.children.length > 0 && (
        <ul className="border-l border-muted-foreground/20 ml-[7px]">
          {node.children.map(child => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}
