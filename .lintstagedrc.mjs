import { relative } from 'path'

const buildEslintCommand = filenames =>
  `eslint --fix --max-warnings=0 ${filenames
    .map(f => relative(process.cwd(), f))
    .join(' ')}`

const stylelintCommand = filenames =>
  `npx stylelint --fix --allow-empty-input ${filenames
    .map(f => relative(process.cwd(), f))
    .join(' ')}`

const typeCheckCommand = () => 'tsc --noEmit'

const vitestRelatedCommand = filenames =>
  `vitest related --run ${filenames
    .map(f => relative(process.cwd(), f))
    .join(' ')}`

const config = {
  '*.{mjs,js,ts,tsx}': [buildEslintCommand],
  '*.css': [stylelintCommand],
  '*.{ts,tsx}': [typeCheckCommand, vitestRelatedCommand],
}

export default config