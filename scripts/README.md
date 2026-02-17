# Скрипты для фикстур и сверки изображений

## generate-fixture-variants.mjs

Генерирует из одного изображения варианты для тестов поиска дубликатов и похожих:

- `*_resized.png` — уменьшенная копия (50%)
- `*_quality.jpg` — то же разрешение, JPEG с пониженным качеством
- `*_grayscale.png` — ч/б
- `*_blur.png` — лёгкое размытие

**Примеры:**

```bash
npm run fixtures:generate -- --input=./photo.png --out=./output
node scripts/generate-fixture-variants.mjs --input=./photo.png --out=./output
```

## check-similar.mjs

Проверяет, считает ли алгоритм перцептивного хэша два изображения (или две папки) похожими. Выводит расстояние Хэмминга и вердикт при заданном пороге.

**Примеры:**

```bash
npm run fixtures:check-similar -- --a=img1.png --b=img2.png --threshold=15
npm run fixtures:check-similar -- --dir1=./folder1 --dir2=./folder2 --threshold=15
```

Порог по умолчанию: 15. Чем меньше расстояние Хэмминга, тем визуально ближе изображения.
