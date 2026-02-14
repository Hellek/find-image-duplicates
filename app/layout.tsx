import './globals.css'

import type { Metadata } from 'next'
import { Cormorant_Garamond, Inter } from 'next/font/google'

const fontSerif = Cormorant_Garamond({
  weight: ['300', '400', '500'],
  variable: '--font-serif',
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  display: 'swap',
})

const fontSans = Inter({
  weight: ['300', '400', '500'],
  variable: '--font-sans',
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Поиск дубликатов изображений',
  description: 'Утилита для поиска дубликатов и визуально похожих изображений. Работает полностью в браузере без загрузки файлов на сервер.',
  keywords: ['дубликаты', 'изображения', 'фото', 'поиск', 'хэширование', 'перцептивный хэш'],
  openGraph: {
    title: 'Поиск дубликатов изображений',
    description: 'Утилита для поиска дубликатов и визуально похожих изображений. Работает полностью в браузере.',
    type: 'website',
    locale: 'ru_RU',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${fontSerif.variable} ${fontSans.variable} antialiased`}>
      <body>
        {children}
      </body>
    </html>
  )
}
