'use client'

import { useEffect, useMemo } from 'react'
import { FileImage } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DuplicateGroup as DuplicateGroupData } from '@/lib/duplicateFinder'
import { createPreviewUrl, formatFileSize } from '@/lib/duplicateFinder'

interface DuplicateGroupProps {
  group: DuplicateGroupData
  index: number
}

export function DuplicateGroup({ group, index }: DuplicateGroupProps) {
  const previewUrls = useMemo(
    () => group.files.map(f => createPreviewUrl(f.file)),
    [group.files],
  )

  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileImage className="size-4" />
          Группа #
          {index + 1}
          <Badge variant="secondary">
            {group.files.length}
            {' '}
            файлов
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {group.files.map((file, fileIdx) => (
            <div key={file.entry.path} className="space-y-1.5">
              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrls[fileIdx]}
                  alt={file.file.name}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="space-y-0.5">
                <p
                  className="text-xs font-medium truncate"
                  title={file.file.name}
                >
                  {file.file.name}
                </p>
                {file.entry.directoryUrl ? (
                  <a
                    href={file.entry.directoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline break-all block"
                    title={file.entry.path}
                  >
                    {file.entry.path}
                  </a>
                ) : (
                  <p
                    className="text-xs text-muted-foreground break-all"
                    title={file.entry.path}
                  >
                    {file.entry.path}
                  </p>
                )}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatFileSize(file.file.size)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
