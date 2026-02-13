/** @type {import('stylelint').Config} */
// Based on https://scottspence.com/posts/stylelint-configuration-for-tailwindcss
module.exports = {
  extends: ['stylelint-config-standard'],
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: [
          'tailwind',
          'for',
          'theme', // Tailwind CSS 4 @theme directive
          'apply', // Tailwind CSS @apply directive
          'layer', // Tailwind CSS @layer directive
          'custom-variant', // Tailwind CSS 4 @custom-variant directive
        ],
      },
    ],
    'function-no-unknown': [
      true,
      {
        ignoreFunctions: ['theme'],
      },
    ],
    'import-notation': null, // Allow @import "tailwindcss" syntax
  },
}
