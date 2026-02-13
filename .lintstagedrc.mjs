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

const config = {
  '*.{mjs, js,ts,tsx}': [buildEslintCommand],
  '*.css': [stylelintCommand],
  '*.{ts,tsx}': [typeCheckCommand],
}

export default config