/**
 * Интеграционные тесты с реальными фикстурами на диске.
 * Точные дубликаты — без моков. Похожие — computePerceptualHash подменён на реализацию через sharp в Node.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { findExactDuplicates, findSimilarDuplicates } from '../duplicateFinder'
import {
  collectFileEntries,
  discoverFiles,
  type FileEntry,
  fromFileList,
} from '../fileSystem'

const BLOCKHASH_BITS = 16

/** Перцептивный хэш в Node через sharp + blockhash-core (для тестов без браузера) */
async function nodePerceptualHash(file: File): Promise<string> {
  const sharp = (await import('sharp')).default
  const { bmvbhash } = await import('blockhash-core')
  const buffer = Buffer.from(await file.arrayBuffer())

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const imageData = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  }

  return bmvbhash(imageData, BLOCKHASH_BITS)
}

vi.mock('../imageHash', async importOriginal => {
  const actual = await importOriginal<typeof import('../imageHash')>()
  return {
    ...actual,
    computePerceptualHash: nodePerceptualHash,
  }
})

const FIXTURES_RECURSIVE_DIR = path.join(__dirname, 'fixtures', 'images', 'recursive')
const FIXTURES_SIMILAR_DIR = path.join(__dirname, 'fixtures', 'images', 'similar')

/** Создаёт FileList из файлов на диске с заданными относительными путями */
function createFileListFromDisk(
  baseDir: string,
  relativePaths: string[],
): FileList {
  const files: File[] = []

  for (const rel of relativePaths) {
    const fullPath = path.join(baseDir, rel)
    const buffer = fs.readFileSync(fullPath)
    const name = path.basename(rel)
    const file = new File([buffer], name, { type: 'image/png' })
    Object.defineProperty(file, 'webkitRelativePath', { value: rel })
    files.push(file)
  }

  const list = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
  } as unknown as FileList

  for (let i = 0; i < files.length; i++) {
    (list as Record<number, File>)[i] = files[i]
  }

  return list
}

const RECURSIVE_RELATIVE_PATHS = [
  'root/a/same.png',
  'root/b/same.png',
  'root/c/d/same.png',
  'root/c/e/same.png',
] as const

describe('duplicateFinder integration', () => {
  describe('recursive discovery and 4 exact duplicates', () => {
    it('finds all 4 identical files in branched directory tree and groups them', async () => {
      const fileList = createFileListFromDisk(FIXTURES_RECURSIVE_DIR, [
        ...RECURSIVE_RELATIVE_PATHS,
      ])

      const source = fromFileList(fileList)
      const signal = new AbortController().signal
      const onProgress = () => {}

      const discovery = await discoverFiles(source, onProgress, signal)
      expect(discovery.totalFiles).toBe(4)

      const entries = await collectFileEntries(discovery, onProgress, signal)
      expect(entries).toHaveLength(4)

      const paths = entries.map((e: FileEntry) => e.path).sort()
      expect(paths).toEqual([...RECURSIVE_RELATIVE_PATHS].sort())

      const groups = await findExactDuplicates(entries, onProgress, signal)
      expect(groups).toHaveLength(1)
      expect(groups[0].files).toHaveLength(4)

      const groupPaths = groups[0].files.map(f => f.entry.path).sort()
      expect(groupPaths).toEqual([...RECURSIVE_RELATIVE_PATHS].sort())
    })
  })

  describe('partial similarity (resized / quality variants)', () => {
    beforeAll(async () => {
      const sharp = (await import('sharp')).default
      const size = 32
      const basePath = path.join(FIXTURES_SIMILAR_DIR, 'base.png')
      const resizedPath = path.join(FIXTURES_SIMILAR_DIR, 'base_resized.png')
      const qualityPath = path.join(FIXTURES_SIMILAR_DIR, 'base_quality.jpg')

      const basePng = await sharp({
        create: {
          width: size,
          height: size,
          channels: 3,
          background: { r: 100, g: 150, b: 200 },
        },
      })
        .png()
        .toBuffer()

      await sharp(basePng).toFile(basePath)
      await sharp(basePng)
        .resize(Math.round(size * 0.5), Math.round(size * 0.5))
        .toFile(resizedPath)
      await sharp(basePng)
        .jpeg({ quality: 70 })
        .toFile(qualityPath)
    })

    it('groups 3 perceptually similar images (base, resized, quality) into one group', async () => {
      const similarPaths = [
        'similar/base.png',
        'similar/base_resized.png',
        'similar/base_quality.jpg',
      ]

      const fullPaths = [
        path.join(FIXTURES_SIMILAR_DIR, 'base.png'),
        path.join(FIXTURES_SIMILAR_DIR, 'base_resized.png'),
        path.join(FIXTURES_SIMILAR_DIR, 'base_quality.jpg'),
      ]

      const files: File[] = []
      for (let i = 0; i < fullPaths.length; i++) {
        const p = fullPaths[i]
        const name = path.basename(p)
        const buffer = fs.readFileSync(p)

        const file = new File([buffer], name, {
          type: name.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
        })

        Object.defineProperty(file, 'webkitRelativePath', {
          value: similarPaths[i],
        })
        files.push(file)
      }

      const list = {
        length: files.length,
        item: (i: number) => files[i] ?? null,
      } as unknown as FileList

      for (let i = 0; i < files.length; i++) {
        (list as Record<number, File>)[i] = files[i]
      }

      const entries: FileEntry[] = files.map((file, i) => ({
        path: similarPaths[i],
        file,
      }))

      const onProgress = () => {}
      const signal = new AbortController().signal

      const groups = await findSimilarDuplicates(
        entries,
        25,
        onProgress,
        signal,
      )

      expect(groups.length).toBeGreaterThanOrEqual(1)
      const group = groups.find(g => g.files.length >= 2)
      expect(group).toBeDefined()
      expect(group!.files.length).toBe(3)
    })
  })
})
