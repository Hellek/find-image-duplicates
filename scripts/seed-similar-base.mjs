#!/usr/bin/env node
/**
 * Создаёт эталонное изображение 32×32 в lib/__tests__/fixtures/images/similar/base.png
 * для последующего запуска fixtures:generate. Один раз перед коммитом фикстур.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const similarDir = path.join(
  __dirname,
  '..',
  'lib',
  '__tests__',
  'fixtures',
  'images',
  'similar',
)

async function main() {
  const sharp = (await import('sharp')).default
  fs.mkdirSync(similarDir, { recursive: true })
  const outPath = path.join(similarDir, 'base.png')
  await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 100, g: 150, b: 200 },
    },
  })
    .png()
    .toFile(outPath)
  console.log('Создан:', outPath)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
