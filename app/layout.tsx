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
  title: '',
  description: '',
  keywords: [],
  openGraph: {
    title: '',
    description: '',
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
