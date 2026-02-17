#!/usr/bin/env node
/**
 * Генерирует варианты одного изображения для тестов поиска дубликатов и похожих:
 * - *_resized.png — уменьшенная копия (50%)
 * - *_quality.jpg — то же разрешение, JPEG с пониженным качеством
 * - *_grayscale.png — ч/б
 * - *_blur.png — лёгкое размытие
 *
 * Использование:
 *   node scripts/generate-fixture-variants.mjs --input=image.png --out=./output
 *   npm run fixtures:generate -- --input=image.png --out=./output
 */
import fs from 'node:fs'
import path from 'node:path'
function parseArgs() {
  const args = process.argv.slice(2)
  let input = null
  let out = null
  for (const arg of args) {
    if (arg.startsWith('--input=')) input = arg.slice(8)
    else if (arg.startsWith('--out=')) out = arg.slice(6)
  }
  if (!input || !out) {
    console.error(
      'Использование: node generate-fixture-variants.mjs --input=<путь к изображению> --out=<директория>',
    )
    process.exit(1)
  }
  return { input: path.resolve(input), out: path.resolve(out) }
}

async function main() {
  const sharp = (await import('sharp')).default
  const { input, out } = parseArgs()

  if (!fs.existsSync(input)) {
    console.error('Файл не найден:', input)
    process.exit(1)
  }

  fs.mkdirSync(out, { recursive: true })
  const baseName = path.basename(input, path.extname(input))

  const buffer = await sharp(input)
  const meta = await buffer.metadata()
  const w = meta.width ?? 32
  const h = meta.height ?? 32

  await buffer
    .resize(Math.round(w * 0.5), Math.round(h * 0.5))
    .png()
    .toFile(path.join(out, `${baseName}_resized.png`))
  console.log('Создан:', path.join(out, `${baseName}_resized.png`))

  await sharp(input)
    .jpeg({ quality: 70 })
    .toFile(path.join(out, `${baseName}_quality.jpg`))
  console.log('Создан:', path.join(out, `${baseName}_quality.jpg`))

  await sharp(input)
    .grayscale()
    .toFile(path.join(out, `${baseName}_grayscale.png`))
  console.log('Создан:', path.join(out, `${baseName}_grayscale.png`))

  await sharp(input)
    .blur(1)
    .toFile(path.join(out, `${baseName}_blur.png`))
  console.log('Создан:', path.join(out, `${baseName}_blur.png`))

  console.log('Готово.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
