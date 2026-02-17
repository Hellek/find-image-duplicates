#!/usr/bin/env node
/**
 * Проверяет, считает ли алгоритм перцептивного хэша два изображения (или две папки) похожими.
 * Выводит расстояние Хэмминга и вердикт при заданном пороге.
 *
 * Использование:
 *   node scripts/check-similar.mjs --a=img1.png --b=img2.png [--threshold=15]
 *   node scripts/check-similar.mjs --dir1=./folder1 --dir2=./folder2 [--threshold=15]
 *   npm run fixtures:check-similar -- --a=img1.png --b=img2.png --threshold=15
 */
import fs from 'node:fs'
import path from 'node:path'
const BLOCKHASH_BITS = 16
const DEFAULT_THRESHOLD = 15

function parseArgs() {
  const args = process.argv.slice(2)
  let a = null
  let b = null
  let dir1 = null
  let dir2 = null
  let threshold = DEFAULT_THRESHOLD
  for (const arg of args) {
    if (arg.startsWith('--a=')) a = arg.slice(4)
    else if (arg.startsWith('--b=')) b = arg.slice(4)
    else if (arg.startsWith('--dir1=')) dir1 = arg.slice(7)
    else if (arg.startsWith('--dir2=')) dir2 = arg.slice(7)
    else if (arg.startsWith('--threshold='))
      threshold = parseInt(arg.slice(11), 10) || DEFAULT_THRESHOLD
  }
  return { a, b, dir1, dir2, threshold }
}

function hammingDistance(hash1, hash2) {
  if (hash1.length !== hash2.length)
    throw new Error(`Разная длина хэшей: ${hash1.length} vs ${hash2.length}`)
  let d = 0
  for (let i = 0; i < hash1.length; i++) {
    const xor = parseInt(hash1[i], 16) ^ parseInt(hash2[i], 16)
    d += ((xor >> 0) & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1)
  }
  return d
}

async function perceptualHash(filePath) {
  const sharp = (await import('sharp')).default
  const { bmvbhash } = await import('blockhash-core')
  const buffer = fs.readFileSync(filePath)
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

function getImagePaths(dir) {
  const exts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
  const list = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isFile() && exts.has(path.extname(name).toLowerCase()))
      list.push(full)
  }
  return list
}

async function main() {
  const { a, b, dir1, dir2, threshold } = parseArgs()

  const resolvePath = p => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p))
  let pairs = []
  if (a != null && b != null) {
    pairs = [[resolvePath(a), resolvePath(b)]]
  } else if (dir1 != null && dir2 != null) {
    const list1 = getImagePaths(resolvePath(dir1))
    const list2 = getImagePaths(resolvePath(dir2))
    for (const p1 of list1) {
      for (const p2 of list2) {
        pairs.push([p1, p2])
      }
    }
    if (pairs.length === 0) {
      console.error('В указанных директориях не найдено изображений.')
      process.exit(1)
    }
  } else {
    console.error(
      'Укажите --a и --b (два файла) или --dir1 и --dir2 (две папки). Опционально --threshold=N (по умолчанию 15).',
    )
    process.exit(1)
  }

  for (const [p1, p2] of pairs) {
    if (!fs.existsSync(p1) || !fs.existsSync(p2)) {
      console.error('Файл не найден:', p1, p2)
      continue
    }
    const hash1 = await perceptualHash(p1)
    const hash2 = await perceptualHash(p2)
    const dist = hammingDistance(hash1, hash2)
    const similar = dist <= threshold
    console.log(path.basename(p1), 'vs', path.basename(p2))
    console.log('  Расстояние Хэмминга:', dist, '| Порог:', threshold)
    console.log('  Похожи:', similar ? 'да' : 'нет')
    console.log('')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
